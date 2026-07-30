/**
 * @file Patient service.
 * @module apps/api/modules/patients/patients.service
 *
 * @description Hayvan (patient) kayıt iş kuralları. Owner doğrulama
 * (cross-tenant → 404), tür whitelist (TR pilot), mikroçip unique
 * (aynı tenant'ta), doğum tarihi geçmiş kontrolü, tenant
 * izolasyonu ve audit event yayını.
 *
 * İş kuralları:
 * - create: owner aynı tenant'ta mı (cross-tenant → 404
 *   VET-AUTHZ-0002); tür TR whitelist'te mi (other → 422
 *   VET-CLINIC-0004); mikroçip 15 hane + unique (aynı tenant
 *   aktif kayıtlar içinde) → 409 VET-CLINIC-0003; doğum tarihi
 *   gelecekte olamaz → 422 VET-VALIDATION-0009. Audit
 *   `audit:patient.create` (info).
 * - findById: tenant-scoped, archive edilmiş kayıtlar gizli
 *   sayılmaz.
 * - search: tenant-scoped, name / microchip / breed araması
 *   + pagination.
 * - archive: soft delete, audit `audit:patient.archive` (warning).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
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

import { OwnersService } from "../owners/owners.service.js";
import {
  PatientsRepository,
  type PatientRecord,
} from "./patients.repository.js";

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  public constructor(
    private readonly owners: OwnersService,
    private readonly repo: PatientsRepository,
    private readonly audit: AuditService,
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
      const dup = this.repo.findByMicrochip(tenantId, input.microchip);
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
    this.repo.insert(record);

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
      metadata: { source: actor.source },
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
    const rec = this.repo.findById(tenantId, id);
    return rec ? this.toPatient(rec) : null;
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
    const result = this.repo.search(tenantId, filters);
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
    const existing = this.repo.findById(tenantId, id);
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
    const archived = this.repo.archive(tenantId, id, at);
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
