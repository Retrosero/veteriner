/**
 * @file Patient service.
 * @module apps/api/modules/patients/patients.service
 *
 * @description Hayvan (patient) kayıt iş kuralları. Owner doğrulama
 * (cross-tenant → 404), tür whitelist (TR pilot), mikroçip unique
 * (aynı tenant'ta), doğum tarihi geçmiş kontrolü, tenant
 * izolasyonu, audit event yayını ve sahiplik devri (kimlik seviyesi).
 *
 * İş kuralları:
 * - create: owner aynı tenant'ta mı (cross-tenant → 404
 *   VET-AUTHZ-0002); tür TR whitelist'te mi (other → 422
 *   VET-CLINIC-0004); mikroçip 15 hane + unique (aynı tenant
 *   aktif kayıtlar içinde) → 409 VET-CLINIC-0003; doğum tarihi
 *   gelecekte olamaz → 422 VET-VALIDATION-0009. Audit
 *   `audit:patient.create` (info). GOAL-022 ile birlikte ilk
 *   sahiplik kaydı (`reason=initial`) otomatik açılır.
 * - findById: tenant-scoped, archive edilmiş kayıtlar gizli
 *   sayılmaz.
 * - search: tenant-scoped, name / microchip / breed araması
 *   + pagination.
 * - archive: soft delete, audit `audit:patient.archive` (warning).
 * - transferOwnership: hasta sahibini günceller (kimlik seviyesi).
 *   Cross-tenant patient veya new owner → 404 VET-AUTHZ-0002;
 *   arşivli hasta → 422 VET-CLINIC-0005; aynı kişiye transfer
 *   → 422 VET-CLINIC-0007. Audit `audit:patient.transfer` (warning)
 *   — before/after ownerId + PII alanları AuditService PiiMasker
 *   ile mask'lenir. In-memory Map'te transfer kaydı tutulur
 *   (DB migration sonraya bırakıldı).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 * @updated GOAL-022 (FAZ-2) ilk sahiplik kaydı + sahiplik devri core
 */

import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";

import {
  PatientsRepository,
  type PatientRecord,
} from "./patients.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  ISO_DATE_REGEX,
  MICROCHIP_REGEX,
  TR_ALLOWED_SPECIES,
  type Patient,
  type PatientCreateInput,
  type PatientFilters,
} from "../../common/patients/patient.types.js";
import { AlertsService } from "../alerts/alerts.service.js";
import { OwnersService } from "../owners/owners.service.js";
import { OwnershipHistoryService } from "../ownership-history/ownership-history.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AlertRecord } from "../../common/alerts/alert.types.js";

/**
 * In-memory transfer audit entry. `PatientOwnerHistory` tablosu
 * yerine kimlik-seviyesi devir kaydı. PII alanları (ownerName,
 * ownerEmail, ownerPhone) AuditService PiiMasker ile mask'lenir;
 * burada plain saklanır.
 */
export interface TransferAuditEntry {
  id: string;
  tenantId: string;
  patientId: string;
  previousOwnerId: string;
  newOwnerId: string;
  reason: string;
  actorId: string | null;
  at: string;
}

/**
 * transferOwnership sonucu. `patient` güncel `Patient`,
 * `transferId` in-memory map anahtarı.
 */
export interface TransferResult {
  patient: Patient;
  transferId: string;
}

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  /**
   * In-memory transfer audit map. GOAL-022'de `PatientOwnerHistory`
   * tablosu yerine kimlik seviyesi audit için kullanılır. Production'a
   * geçişte Prisma `PatientTransfer` tablosu ile değiştirilecek; API
   * sözleşmesi sabit kalacak.
   *
   * key: transferId → TransferAuditEntry.
   */
  private readonly transferAudit = new Map<string, TransferAuditEntry>();

  public constructor(
    private readonly owners: OwnersService,
    private readonly repo: PatientsRepository,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => OwnershipHistoryService))
    private readonly ownership: OwnershipHistoryService,
    @Inject(forwardRef(() => AlertsService))
    private readonly alerts: AlertsService,
  ) {}

  /**
   * Yeni hasta (hayvan) oluşturur. Owner doğrulama, tür whitelist,
   * mikroçip unique kontrolü, doğum tarihi geçmiş kontrolü yapar.
   */
  public async create(
    tenantId: string,
    input: PatientCreateInput,
    actor: ActorContext,
  ): Promise<Patient> {
    this.requireTenantScope(actor, tenantId);

    // 1) Owner doğrulama (cross-tenant → 404 VET-AUTHZ-0002).
    const owner = await this.owners.findById(tenantId, input.ownerId, actor);
    if (!owner) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Hasta sahibi bulunamadı",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-AUTHZ-0002",
        details: { ownerId: input.ownerId },
      });
    }

    // 2) Tür whitelist (TR pilot).
    if (!TR_ALLOWED_SPECIES.includes(input.species)) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0004",
        message: "Tür izin verilmiyor",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0004",
        details: { species: input.species, allowed: TR_ALLOWED_SPECIES },
      });
    }

    // 3) Mikroçip unique (aynı tenant'ta aktif kayıtlar içinde).
    if (input.microchip !== undefined) {
      if (!MICROCHIP_REGEX.test(input.microchip)) {
        throw new DomainError({
          errorCode: "VET-VALIDATION-0003",
          message: "Mikroçip 15 haneli olmalı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-VALIDATION-0003",
          details: { field: "microchip" },
        });
      }
      const dup = await this.repo.findPersistedByMicrochip(tenantId, input.microchip);
      if (dup) {
        throw new DomainError({
          errorCode: "VET-CLINIC-0003",
          message: "Mikroçip zaten kullanımda",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-CLINIC-0003",
          details: { microchip: input.microchip },
        });
      }
    }

    // 4) Doğum tarihi gelecekte olamaz.
    if (input.birthDate !== undefined) {
      if (!ISO_DATE_REGEX.test(input.birthDate)) {
        throw new DomainError({
          errorCode: "VET-VALIDATION-0009",
          message: "Geçersiz tarih",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-VALIDATION-0009",
          details: { field: "birthDate" },
        });
      }
      const today = new Date().toISOString().slice(0, 10);
      if (input.birthDate > today) {
        throw new DomainError({
          errorCode: "VET-VALIDATION-0009",
          message: "Doğum tarihi gelecekte olamaz",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-VALIDATION-0009",
          details: { field: "birthDate", value: input.birthDate },
        });
      }
    }

    const id = this.repo.nextId(tenantId);
    const record = this.repo.toRecord(id, tenantId, input);
    await this.repo.persist(record);

    // GOAL-022: ilk sahiplik kaydını otomatik aç. Hasta kimliği
    // oluşturulduktan sonra, onun aktif sahiplik kaydı olmadan
    // var olması veri bütünlüğünü bozar. createInitial kendi
    // audit'ini yayar; burada ek bir event yayınlamaya gerek yok.
    try {
      await this.ownership.createInitial(tenantId, id, record.ownerId, actor);
    } catch (err) {
      // Sahiplik kaydı açılamadıysa hasta kaydını da geri al
      // (transactional compensation). Hasta append-only olmadığı
      // için (identity) burada archive edilebilir; ancak GOAL-021
      // semantiği "identity gizleme" olduğu için hata durumunda
      // bırakmak yerine exception propagate ederiz.
      this.logger.error(
        `Hasta ${id} için ilk sahiplik kaydı açılamadı: ${(err as Error).message}`,
      );
      throw err;
    }

    await this.audit.record({
      eventName: "audit:patient.create",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "patient",
      targetId: id,
      action: "create",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        ownerId: record.ownerId,
        name: record.name,
        species: record.species,
        breed: record.breed,
        birthDate: record.birthDate,
        gender: record.gender,
        microchip: record.microchip,
        neutered: record.neutered,
      },
      metadata: { source: actor.source, ownershipInitial: true },
    });

    return this.toPatient(record);
  }

  /**
   * ID ile getirir. Tenant izolasyonu burada uygulanır; farklı
   * tenant isteği → null (controller 404).
   */
  public async findById(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Patient | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.findPersistedById(tenantId, id);
    return rec ? this.toPatient(rec) : null;
  }

  /**
   * Hastanın aktif klinik uyarılarını döner. Muayene/reçete
   * oluşturma sırasında UI tarafından çağrılır (GOAL-023).
   * Cross-tenant → null. Arşivli hasta uyarıları da döner
   * (UI flag'a göre filtreler).
   */
  public async listActiveAlertsForPatient(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<AlertRecord[]> {
    this.requireTenantScope(actor, tenantId);
    const patient = await this.repo.findPersistedById(tenantId, patientId);
    if (!patient) return [];
    return this.alerts.getActiveAlertsForPatient(tenantId, patientId, actor);
  }

  /**
   * Tenant-scoped arama. Search name / breed / microchip üzerinde
   * case-insensitive substring match yapar.
   */
  public async search(
    tenantId: string,
    filters: PatientFilters,
    actor: ActorContext,
  ): Promise<{ items: Patient[]; total: number }> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.searchPersisted(tenantId, filters);
    return {
      items: result.items.map((r) => this.toPatient(r)),
      total: result.total,
    };
  }

  /**
   * Hayvanı arşivler (soft delete). Klinik kayıtlar append-only
   * olduğu için asıl tedavi/aşı kayıtları etkilenmez; yalnızca
   * identity (Patient) gizlenir.
   */
  public async archive(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Patient> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.findPersistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    if (existing.archivedAt !== null) {
      // Idempotent: zaten arşivli, mevcut kaydı döndür.
      return this.toPatient(existing);
    }
    const at = new Date().toISOString();
    const archived = await this.repo.archivePersisted(tenantId, id, at);
    if (!archived) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }

    await this.audit.record({
      eventName: "audit:patient.archive",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "patient",
      targetId: id,
      action: "archive",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { archivedAt: null },
      after: { archivedAt: at },
      metadata: { source: actor.source },
    });

    return this.toPatient(archived);
  }

  /**
   * Sahiplik devri (kimlik seviyesi). `Patient.ownerId` alanını yeni
   * sahibe günceller; klinik/finansal kayıtlar (muayene, aşı vb.)
   * bu değişiklikten etkilenmez — append-only korunur.
   *
   * `OwnershipHistoryService.transfer`'dan farklıdır: burada
   * tarihsel ownership kaydı açılmaz; yalnızca patient kimliği
   * güncellenir. Tam tarihçe gerektiğinde `OwnershipHistoryService`
   * kullanılmalı.
   *
   * @security
   * - Cross-tenant patient/new owner → 404 (bilgi sızdırmaz).
   * - Audit before/after PII alanları AuditService PiiMasker ile
   *   mask'lenir (maskeleme otomatiktir; bu servis plain alanlar
   *   hazırlar).
   */
  public async transferOwnership(
    tenantId: string,
    patientId: string,
    newOwnerId: string,
    reason: string,
    actor: ActorContext,
  ): Promise<TransferResult> {
    this.requireTenantScope(actor, tenantId);

    // 1) Patient tenant-scoped doğrulama (yoksa → 404 VET-AUTHZ-0002).
    const existing = await this.repo.findPersistedById(tenantId, patientId);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-AUTHZ-0002",
        details: { patientId },
      });
    }

    // 2) Arşivli hasta → 422 VET-CLINIC-0005.
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0005",
        message: "Sahiplik devri başarısız",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0005",
        details: { patientId, archivedAt: existing.archivedAt },
      });
    }

    // 3) Yeni owner aynı tenant'ta mı (cross-tenant → 404).
    const newOwner = await this.owners.findById(tenantId, newOwnerId, actor);
    if (!newOwner) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Yeni sahip bulunamadı",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-AUTHZ-0002",
        details: { newOwnerId },
      });
    }

    // 4) Aynı kişiye transfer → 422 VET-CLINIC-0007 (no-op).
    if (existing.ownerId === newOwnerId) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0007",
        message: "Yeni sahip mevcut sahiple aynı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0007",
        details: { patientId, ownerId: existing.ownerId },
      });
    }

    // 5) Snapshot: `repo.updateOwner` aynı record referansını
    // mutate eder; bu yüzden audit/entry'de kullanılacak eski
    // ownerId'i update'den ÖNCE kopyalıyoruz.
    const previousOwnerId = existing.ownerId;

    // 6) Eski sahip bilgisi (audit before için). Aynı tenant'ta
    // olmalı; değilse boş geçilir.
    const oldOwner = await this.owners.findById(
      tenantId,
      previousOwnerId,
      actor,
    );

    // 7) Repository güncellemesi (kimlik seviyesi).
    const updated = await this.repo.updatePersistedOwner(tenantId, patientId, newOwnerId);
    if (!updated) {
      // Repo'da nadir koşul (aradaki yarış). 404 ile korunur.
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }

    // 8) Audit before/after. PII alanları (firstName, lastName,
    // email, phone) AuditService PiiMasker ile otomatik mask'lenir.
    const before = {
      ownerId: previousOwnerId,
      ownerName: oldOwner
        ? `${oldOwner.firstName} ${oldOwner.lastName}`.trim()
        : null,
      ownerEmail: oldOwner?.email ?? null,
      ownerPhone: oldOwner?.phone ?? null,
    };
    const after = {
      ownerId: newOwner.id,
      ownerName: `${newOwner.firstName} ${newOwner.lastName}`.trim(),
      ownerEmail: newOwner.email,
      ownerPhone: newOwner.phone,
    };

    await this.audit.record({
      eventName: "audit:patient.transfer",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "patient",
      targetId: patientId,
      action: "transfer",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before,
      after,
      metadata: {
        reason,
        previousOwnerId,
        newOwnerId: newOwner.id,
        source: actor.source,
      },
    });

    // 9) In-memory transfer audit map'e kayıt.
    const transferId = `txf-${tenantId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    const entry: TransferAuditEntry = {
      id: transferId,
      tenantId,
      patientId,
      previousOwnerId,
      newOwnerId: newOwner.id,
      reason,
      actorId: actor.actorId,
      at: new Date().toISOString(),
    };
    this.transferAudit.set(transferId, entry);

    return { patient: this.toPatient(updated), transferId };
  }

  /**
   * In-memory transfer audit map'ten tekil kayıt getirir. Test ve
   * ileride admin görünümü için. Cross-tenant → null.
   */
  public getTransferAudit(
    tenantId: string,
    transferId: string,
  ): TransferAuditEntry | null {
    const entry = this.transferAudit.get(transferId);
    if (!entry || entry.tenantId !== tenantId) return null;
    return entry;
  }

  /**
   * Test yardımcısı: in-memory transfer map'i temizler.
   */
  public clearTransferAudit(): void {
    this.transferAudit.clear();
  }

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  private toPatient(rec: PatientRecord): Patient {
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      ownerId: rec.ownerId,
      name: rec.name,
      species: rec.species,
      breed: rec.breed,
      birthDate: rec.birthDate,
      gender: rec.gender,
      microchip: rec.microchip,
      color: rec.color,
      neutered: rec.neutered,
      notes: rec.notes,
      createdAt: rec.createdAt,
      archivedAt: rec.archivedAt,
    };
  }
}
