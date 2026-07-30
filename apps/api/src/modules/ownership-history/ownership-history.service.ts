/**
 * @file Ownership history service.
 * @module apps/api/modules/ownership-history/ownership-history.service
 *
 * @description Hayvan sahiplik geçmişi iş kuralları. Eski sahiplik
 * ilişkisi silinmez; aktif kayıt tek olmalı, transfer sırasında
 * eski kayıt kapatılır + yeni kayıt açılır (append-only). Tüm
 * işlemler audit eventi üretir. Portal erişimi yeni sahiplik
 * durumuna göre güncellenir (şimdilik domain event'i ile
 * bildirilir; gerçek portal güncellemesi GOAL-025 kapsamında
 * yapılacak).
 *
 * İş kuralları:
 * - `createInitial`: yeni patient için ilk sahiplik kaydı
 *   (`reason=initial`, endDate=null). Aktif kayıt yoksa kabul;
 *   varsa → 409 VET-CLINIC-0006.
 * - `transfer`: aktif kaydı kapat + yeni kayıt aç. Yeni sahip
 *   aynı tenant'ta olmalı (cross-tenant → 404 VET-AUTHZ-0002).
 *   Aynı kişiye transfer no-op (422 VET-CLINIC-0007). Patient
 *   arşivli ise → 422 VET-CLINIC-0008.
 * - `list`: tenant-scoped, opsiyonel patientId / ownerId filtresi.
 * - `findActiveByPatient`: tekil aktif kayıt (UI/portal lookup için).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-022 (FAZ-2) sahiplik geçmişi core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  Ownership,
  OwnershipFilters,
} from "../../common/ownership/ownership.types.js";
import {
  PatientsRepository,
  type PatientRecord,
} from "../patients/patients.repository.js";
import { OwnersService } from "../owners/owners.service.js";
import {
  OwnershipHistoryRepository,
  type OwnershipRecord,
} from "./ownership-history.repository.js";

@Injectable()
export class OwnershipHistoryService {
  private readonly logger = new Logger(OwnershipHistoryService.name);

  public constructor(
    private readonly repo: OwnershipHistoryRepository,
    private readonly patients: PatientsRepository,
    private readonly owners: OwnersService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Yeni hasta için ilk sahiplik kaydını oluşturur. `reason=initial`
   * sabittir; başka neden kabul edilmez (ilk kayıt özeldir).
   */
  public async createInitial(
    tenantId: string,
    patientId: string,
    ownerId: string,
    actor: ActorContext,
  ): Promise<Ownership> {
    this.requireTenantScope(actor, tenantId);

    const patient = this.requirePatient(tenantId, patientId);
    if (patient.ownerId !== ownerId) {
      // Patient oluşturulurken farklı bir ownerId verildiyse
      // bütünlük hatası; çağıran taraf (PatientsService) bunu
      // bilinçli olarak ayarlamalıdır.
      this.logger.warn(
        `createInitial: patient ${patient.id} ile owner ${ownerId} uyumsuz (patient.ownerId=${patient.ownerId})`,
      );
    }

    const existing = this.repo.findActiveByPatient(tenantId, patientId);
    if (existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0006",
        message: "Bu hayvan için zaten aktif sahiplik kaydı var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0006",
        details: {
          patientId,
          existingOwnershipId: existing.id,
          existingOwnerId: existing.ownerId,
        },
      });
    }

    const id = this.repo.nextId(tenantId);
    const record = this.repo.toRecord(id, {
      tenantId,
      patientId,
      ownerId,
      startDate: patient.createdAt,
      reason: "initial",
      createdBy: actor.actorId,
    });
    this.repo.insert(record);

    await this.audit.record({
      eventName: "audit:ownership.create",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "ownership",
      targetId: id,
      action: "create",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        patientId: record.patientId,
        ownerId: record.ownerId,
        reason: record.reason,
        startDate: record.startDate,
        endDate: null,
      },
      metadata: { kind: "initial", source: actor.source },
    });

    return this.toOwnership(record);
  }

  /**
   * Sahiplik devri. Aktif kayıt kapatılır + yeni aktif kayıt açılır.
   * Patient'in `ownerId` alanı da yeni sahibe güncellenir.
   */
  public async transfer(
    tenantId: string,
    patientId: string,
    input: {
      newOwnerId: string;
      reason: Ownership["reason"];
      otherNote?: string;
      startDate?: string;
    },
    actor: ActorContext,
  ): Promise<{ closed: Ownership | null; opened: Ownership }> {
    this.requireTenantScope(actor, tenantId);

    const patient = this.requirePatient(tenantId, patientId);

    // Yeni owner aynı tenant'ta mı?
    const newOwner = await this.owners.findById(
      tenantId,
      input.newOwnerId,
      actor,
    );
    if (!newOwner) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Yeni sahip bulunamadı",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-AUTHZ-0002",
        details: { newOwnerId: input.newOwnerId },
      });
    }

    const current = this.repo.findActiveByPatient(tenantId, patientId);
    if (!current) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0005",
        message: "Aktif sahiplik kaydı bulunamadı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0005",
        details: { patientId },
      });
    }

    // Aynı kişiye transfer → no-op.
    if (current.ownerId === input.newOwnerId) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0007",
        message: "Yeni sahip mevcut sahiple aynı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0007",
        details: {
          patientId,
          ownerId: current.ownerId,
        },
      });
    }

    // Patient arşivli ise transfer reddedilir.
    if (patient.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0008",
        message: "Arşivlenmiş hayvana sahiplik devri yapılamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0008",
        details: { patientId },
      });
    }

    // `initial` reason transfer için kullanılamaz; yalnızca ilk
    // kayıt oluşturma noktasında atanır.
    if (input.reason === "initial") {
      throw new DomainError({
        errorCode: "VET-CLINIC-0009",
        message: "Transfer nedeni 'initial' olamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0009",
        details: { reason: input.reason },
      });
    }

    if (input.reason === "other" && !input.otherNote) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0004",
        message: "Sebep 'other' ise açıklama zorunlu",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0004",
        details: { field: "otherNote" },
      });
    }

    const newStart =
      input.startDate ?? new Date().toISOString();
    if (current.startDate > newStart) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0010",
        message: "Yeni başlangıç tarihi mevcut kayıttan önce olamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0010",
        details: {
          currentStartDate: current.startDate,
          newStartDate: newStart,
        },
      });
    }

    // 1) Eski aktif kaydı kapat.
    const closedRecord = this.repo.closeActive(
      tenantId,
      patientId,
      newStart,
    );

    // 2) Yeni kayıt aç.
    const newId = this.repo.nextId(tenantId);
    const newRecord = this.repo.toRecord(newId, {
      tenantId,
      patientId,
      ownerId: input.newOwnerId,
      startDate: newStart,
      reason: input.reason,
      ...(input.otherNote !== undefined && { otherNote: input.otherNote }),
      createdBy: actor.actorId,
    });
    this.repo.insert(newRecord);

    // 3) Patient.ownerId güncellenir (kimlik seviyesi).
    patient.ownerId = input.newOwnerId;
    this.patients.updateOwner(tenantId, patientId, input.newOwnerId);

    await this.audit.record({
      eventName: "audit:ownership.transfer",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "ownership",
      targetId: newRecord.id,
      action: "transfer",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: closedRecord
        ? {
            ownershipId: closedRecord.id,
            ownerId: closedRecord.ownerId,
            startDate: closedRecord.startDate,
            endDate: newStart,
          }
        : null,
      after: {
        ownershipId: newRecord.id,
        ownerId: newRecord.ownerId,
        startDate: newRecord.startDate,
        endDate: null,
        reason: newRecord.reason,
        otherNote: newRecord.otherNote,
      },
      metadata: {
        previousOwnerId: current.ownerId,
        newOwnerId: newRecord.ownerId,
        reason: newRecord.reason,
        otherNote: newRecord.otherNote,
        portal: "refresh_required", // GOAL-025'e sinyal
        source: actor.source,
      },
    });

    return {
      closed: closedRecord ? this.toOwnership(closedRecord) : null,
      opened: this.toOwnership(newRecord),
    };
  }

  /**
   * Tenant-scoped listeleme. En yeni (startDate) kayıt üstte.
   */
  public async list(
    tenantId: string,
    filters: OwnershipFilters,
    actor: ActorContext,
  ): Promise<{ items: Ownership[]; total: number }> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, filters);
    return {
      items: result.items.map((r) => this.toOwnership(r)),
      total: result.total,
    };
  }

  /**
   * Patient için aktif kaydı getirir. UI/portal lookup.
   * Cross-tenant → null.
   */
  public async findActiveByPatient(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<Ownership | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findActiveByPatient(tenantId, patientId);
    return rec ? this.toOwnership(rec) : null;
  }

  private requirePatient(tenantId: string, patientId: string): PatientRecord {
    const patient = this.patients.findById(tenantId, patientId);
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { patientId },
      });
    }
    return patient;
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

  private toOwnership(rec: OwnershipRecord): Ownership {
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      patientId: rec.patientId,
      ownerId: rec.ownerId,
      startDate: rec.startDate,
      endDate: rec.endDate,
      reason: rec.reason,
      otherNote: rec.otherNote,
      createdBy: rec.createdBy,
      createdAt: rec.createdAt,
    };
  }
}
