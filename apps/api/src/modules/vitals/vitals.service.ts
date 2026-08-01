/**
 * @file Vitals service.
 * @module apps/api/modules/vitals/vitals.service
 *
 * @description GOAL-042 vital bulgular (vücut sıcaklığı, nabız,
 * solunum, ağırlık, BCS, kan basıncı, CRT, mukoza rengi) iş
 * kuralları. Examination (GOAL-040) ile entegre: vital kaydı
 * muayeneye bağlıdır, patient + veterinarian muayeneden
 * türetilir. Tenant scope actor.tenantId'den alınır.
 *
 * İş kuralları:
 * - `record`: Examination aynı tenant'ta mı (cross-tenant →
 *   404 VET-CLINIC-0001). vitalSigns alanlarının en az biri
 *   dolu olmalı; aksi → 422 VET-VALIDATION-0010. Range
 *   validation Zod schema tarafından yapılır (burada ek
 *   alan düzeyinde boş guard). takenAt default = now.
 *   Audit `audit:vitals.record` (info).
 * - `findByExamination`: tenant-scoped, takenAt desc.
 * - `latestForPatient`: hasta için en yeni vital, yoksa null.
 *   Hasta aynı tenant'ta mı (cross-tenant → 404 VET-CLINIC-0001).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-042 (FAZ-4) vital bulgular core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type VitalsPersistRecord,
  VitalsRepository,
  toVitalsRecord,
} from "./vitals.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { ExaminationsService } from "../examinations/examinations.service.js";
import { PatientsService } from "../patients/patients.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  VitalSigns,
  VitalSignsCreateInput,
  VitalsRecord,
} from "@vetniva/contracts";

@Injectable()
export class VitalsService {
  private readonly logger = new Logger(VitalsService.name);

  public constructor(
    private readonly repo: VitalsRepository,
    private readonly examinations: ExaminationsService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // record
  // -------------------------------------------------------------------------

  public async record(
    tenantId: string,
    examinationId: string,
    input: VitalSignsCreateInput,
    actor: ActorContext,
  ): Promise<VitalsRecord> {
    this.requireTenantScope(actor, tenantId);

    // 1) Examination aynı tenant'ta mı (cross-tenant → 404).
    const exam = await this.examinations.findById(
      tenantId,
      examinationId,
      actor,
    );
    if (!exam) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }

    // 2) En az bir vital alanı dolu olmalı.
    if (!hasAnyMeasurement(input.vitalSigns)) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message:
          "En az bir vital bulgu (ateş, nabız, solunum, vb.) girilmelidir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { examinationId },
      });
    }

    // 3) Persist.
    const id = this.repo.nextId(tenantId);
    const now = new Date().toISOString();
    const takenAt = input.takenAt ?? now;
    const record: VitalsPersistRecord = this.repo.insert({
      id,
      tenantId,
      examinationId,
      patientId: exam.patientId,
      veterinarianId: exam.veterinarianId,
      vitalSigns: input.vitalSigns,
      takenAt,
      recordedBy: actor.actorId ?? "system",
    });

    // 4) Audit.
    await this.audit.recordSimple(
      "audit:vitals.record",
      "vitals",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        examinationId: record.examinationId,
        patientId: record.patientId,
        veterinarianId: record.veterinarianId,
        takenAt: record.takenAt,
        fields: Object.keys(input.vitalSigns),
      },
    );

    return toVitalsRecord(record);
  }

  // -------------------------------------------------------------------------
  // findByExamination
  // -------------------------------------------------------------------------

  public async findByExamination(
    tenantId: string,
    examinationId: string,
    actor: ActorContext,
  ): Promise<VitalsRecord[]> {
    this.requireTenantScope(actor, tenantId);
    // Tenant-scoped sorgu; examinationId farklı tenant'ta olsa
    // bile sorgu boş döner (güvenli). Burada ayrı bir examination
    // varlık kontrolü YAPILMAZ — read endpoint'i, ölçüm listesi
    // döndürür; muayene bulunamazsa boş liste semantiği tercih
    // edildi (controller 404 ayrıca yapmaz).
    const recs = this.repo.findByExamination(tenantId, examinationId);
    return recs.map((r) => toVitalsRecord(r));
  }

  // -------------------------------------------------------------------------
  // latestForPatient
  // -------------------------------------------------------------------------

  public async latestForPatient(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<VitalsRecord | null> {
    this.requireTenantScope(actor, tenantId);

    // Patient aynı tenant'ta mı (cross-tenant → 404). Bu kontrol,
    // hasta bazında latest sorgusunun varlık kontrolü niteliğindedir;
    // controller 404 üretir.
    const patient = await this.patients.findById(tenantId, patientId, actor);
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

    const rec = this.repo.latestForPatient(tenantId, patientId);
    return rec ? toVitalsRecord(rec) : null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

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

  private actorToAuditActor(actor: ActorContext): {
    actorId: string | null;
    actorType: "user" | "system" | "portal_user";
    tenantId: string | null;
    branchId: string | null;
    correlationId: string;
    country: string;
  } {
    return {
      actorId: actor.actorId,
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}

/**
 * VitalSigns nesnesinde en az bir ölçüm alanı dolu mu? `notes`
 * tek başına yetmez (klinik değer taşımaz).
 */
function hasAnyMeasurement(v: VitalSigns): boolean {
  return (
    v.temperatureC !== undefined ||
    v.heartRateBpm !== undefined ||
    v.respiratoryRateBpm !== undefined ||
    v.weightKg !== undefined ||
    v.bodyConditionScore !== undefined ||
    v.bloodPressureSystolic !== undefined ||
    v.bloodPressureDiastolic !== undefined ||
    v.capillaryRefillTime !== undefined ||
    v.mucousMembraneColor !== undefined
  );
}
