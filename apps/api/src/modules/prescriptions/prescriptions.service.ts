/**
 * @file Prescription service.
 * @module apps/api/modules/prescriptions/prescriptions.service
 *
 * @description GOAL-045 reçete oluşturma ve yaşam döngüsü iş
 * kuralları. ExaminationsService (GOAL-040) ile entegre: reçete
 * yazılırken muayene aynı tenant'ta mı doğrulanır (cross-tenant
 * → 404). Patient + veterinarian muayeneden türetilir.
 *
 * İş kuralları:
 * - `create`: Examination aynı tenant'ta mı (cross-tenant → 404
 *   VET-CLINIC-0001); items.length > 0 (boş → 422); durationDays
 *   1-30 arası (aşımı → 422 VET-VALIDATION-0010). expiresAt =
 *   now + durationDays gün. status='active'. Audit
 *   `audit:prescription.create` (info).
 * - `findById`: tenant-scoped; cross-tenant → null.
 * - `list`: tenant-scoped; patientId / status / from / to
 *   filtreleri; pagination.
 * - `dispense`: status='active' → 'dispensed'; dispensedAt +
 *   dispensedBy set. Audit `audit:prescription.dispense` (info).
 * - `cancel`: status='active' → 'cancelled'; cancelReason set.
 *   Audit `audit:prescription.cancel` (warning).
 * - `expireOverdue`: periyodik job — `status='active' && expiresAt <
 *   now` olanları 'expired' yapar. Dönüş: güncellenen kayıt sayısı.
 * - `pdf`: placeholder buffer (text/plain). Gerçek PDF FAZ-10+'da.
 *   Audit `audit:prescription.pdf` (info).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Reçete üzerinde fiziksel
 *   silme YOKTUR.
 *
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 */

import { Injectable, Logger } from "@nestjs/common";

import { PrescriptionsRepository } from "./prescriptions.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toPrescription,
  type PrescriptionRecord,
} from "../../common/prescriptions/prescription.types.js";
import { ClinicalConsumptionService } from "../clinical-consumption/clinical-consumption.service.js";
import { ExaminationsService } from "../examinations/examinations.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  ClinicalConsumptionLine,
  Prescription,
  PrescriptionCancelInput,
  PrescriptionCreateInput,
  PrescriptionFilters,
  PrescriptionListResponse,
} from "@vetniva/contracts";

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  public constructor(
    private readonly repo: PrescriptionsRepository,
    private readonly examinations: ExaminationsService,
    private readonly clinicalConsumption: ClinicalConsumptionService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  public async create(
    tenantId: string,
    input: PrescriptionCreateInput,
    actor: ActorContext,
  ): Promise<Prescription> {
    this.requireTenantScope(actor, tenantId);

    // 1) Examination aynı tenant'ta mı (cross-tenant → 404).
    const exam = await this.examinations.findById(
      tenantId,
      input.examinationId,
      actor,
    );
    if (!exam) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId: input.examinationId },
      });
    }

    // 2) İş kuralları.
    if (input.items.length === 0) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "Reçete en az bir ilaç kalemi içermelidir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { itemsLength: 0 },
      });
    }
    if (input.durationDays < 1 || input.durationDays > 30) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "Reçete süresi 1-30 gün arasında olmalıdır",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { durationDays: input.durationDays },
      });
    }

    // 3) expiresAt = now + durationDays gün.
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + input.durationDays * 24 * 60 * 60 * 1000,
    );
    const nowIso = now.toISOString();
    const expiresIso = expiresAt.toISOString();

    // 4) Repository'ye ekle.
    const id = this.repo.nextId(tenantId);
    const record: PrescriptionRecord = this.repo.toRecord({
      id,
      tenantId,
      examinationId: exam.id,
      patientId: exam.patientId,
      veterinarianId: exam.veterinarianId,
      items: input.items,
      notes: input.notes ?? null,
      status: "active",
      prescribedAt: nowIso,
      expiresAt: expiresIso,
      dispensedAt: null,
      dispensedBy: null,
      cancelReason: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    await this.repo.persist(record);

    // 5) Audit.
    await this.audit.recordSimple(
      "audit:prescription.create",
      "prescription",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        examinationId: record.examinationId,
        patientId: record.patientId,
        veterinarianId: record.veterinarianId,
        status: record.status,
        itemCount: record.items.length,
        durationDays: input.durationDays,
        expiresAt: record.expiresAt,
      },
    );

    return toPrescription(record);
  }

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  public async findById(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Prescription | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedFindById(tenantId, id);
    return rec ? toPrescription(rec) : null;
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  public async list(
    tenantId: string,
    filters: PrescriptionFilters,
    actor: ActorContext,
  ): Promise<PrescriptionListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearch(tenantId, {
      patientId: filters.patientId,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toPrescription(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // dispense
  // -------------------------------------------------------------------------

  public async dispense(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Prescription> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedFindById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Reçete bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status !== "active") {
      throw new DomainError({
        errorCode: "VET-PRESC-0003",
        message: "Yalnızca aktif reçete dağıtılabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRESC-0003",
        details: { id, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    // Reçete dispans anında ürün referansı taşıyan
    // kalemler için otomatik klinik tüketim kaydı oluştur
    // (stoktan düşüm). Ürün referansı olmayan kalemler (serbest
    // metin ilaç talimatı) için no-op.
    const consumptionLines: ClinicalConsumptionLine[] = [];
    for (const item of existing.items) {
      if (item.productId && item.dispensedQuantity) {
        consumptionLines.push({
          productId: item.productId,
          quantity: item.dispensedQuantity,
          ...(item.dispensedLotId ? { lotId: item.dispensedLotId } : {}),
        });
      }
    }
    let updated = await this.repo.dispenseWithConsumption(
      tenantId,
      id,
      actor.actorId ?? "system",
      consumptionLines,
      now,
    );
    if (!updated) {
      // Unit test/uyumluluk modunda Prisma yoktur; eski bellek içi akışı
      // sözleşme testleri için korunur. Çalışma zamanında yukarıdaki
      // transaction yolu kullanılır.
      updated = await this.repo.persistedUpdate(tenantId, id, {
        status: "dispensed",
        dispensedAt: now,
        dispensedBy: actor.actorId,
        updatedAt: now,
      });
      if (!updated) {
        throw new DomainError({
          errorCode: "VET-CLINIC-0001",
          message: "Reçete bulunamadı veya dağıtıma uygun değil",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-CLINIC-0001",
          details: { id },
        });
      }
      if (consumptionLines.length > 0) {
        await this.clinicalConsumption.recordForPrescription(
          tenantId,
          updated.id,
          updated.patientId,
          consumptionLines,
          actor,
        );
      }
    }

    await this.audit.recordSimple(
      "audit:prescription.dispense",
      "prescription",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: { status: existing.status, dispensedAt: existing.dispensedAt },
        after: { status: updated.status, dispensedAt: updated.dispensedAt },
        dispensedBy: updated.dispensedBy,
        clinicalConsumptionLines: consumptionLines.length,
      },
    );

    return toPrescription(updated);
  }

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  public async cancel(
    tenantId: string,
    id: string,
    input: PrescriptionCancelInput,
    actor: ActorContext,
  ): Promise<Prescription> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedFindById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Reçete bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-PRESC-0004",
        message: "Reçete zaten iptal edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRESC-0004",
        details: { id },
      });
    }
    if (
      existing.status === "dispensed" ||
      existing.status === "expired" ||
      existing.status === "completed"
    ) {
      throw new DomainError({
        errorCode: "VET-PRESC-0004",
        message: "Reçete bu durumdan iptal edilemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRESC-0004",
        details: { id, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    const updated = await this.repo.persistedUpdate(tenantId, id, {
      status: "cancelled",
      cancelReason: input.reason,
      updatedAt: now,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Reçete bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:prescription.cancel",
      "prescription",
      id,
      "update",
      this.actorToAuditActor(actor),
      "warning",
      {
        before: {
          status: existing.status,
          cancelReason: existing.cancelReason,
        },
        after: { status: updated.status, cancelReason: updated.cancelReason },
        reason: input.reason,
      },
    );

    return toPrescription(updated);
  }

  // -------------------------------------------------------------------------
  // expireOverdue
  // -------------------------------------------------------------------------

  /**
   * Tüm tenant'larda `status='active' && expiresAt < now` olan
   * reçeteleri 'expired' yapar. Periyodik job tarafından çağrılır
   * (FAZ-0'da manuel). Dönüş: güncellenen kayıt sayısı.
   */
  public async expireOverdue(): Promise<number> {
    const now = new Date().toISOString();
    const overdue = await this.repo.persistedOverdueActive(now);
    if (overdue.length === 0) return 0;
    const nowPatch: string = now;
    for (const rec of overdue) {
      await this.repo.persistedUpdate(rec.tenantId, rec.id, {
        status: "expired",
        updatedAt: nowPatch,
      });
    }
    this.logger.log({
      msg: "prescription.expireOverdue",
      count: overdue.length,
      at: nowPatch,
    });
    return overdue.length;
  }

  // -------------------------------------------------------------------------
  // pdf
  // -------------------------------------------------------------------------

  /**
   * Reçete PDF render. FAZ-0'da placeholder buffer (text/plain
   * içerikli); gerçek PDF render FAZ-10+'da. Tenant scope
   * doğrulanır; reçete bulunamazsa 404.
   */
  public async pdf(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Buffer> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedFindById(tenantId, id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Reçete bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    // Placeholder: text/plain içerikli buffer. Gerçek PDF FAZ-10+'da.
    const lines: string[] = [
      `Prescription ${rec.id}`,
      `Tenant: ${rec.tenantId}`,
      `Patient: ${rec.patientId}`,
      `Veterinarian: ${rec.veterinarianId}`,
      `Status: ${rec.status}`,
      `PrescribedAt: ${rec.prescribedAt}`,
      `ExpiresAt: ${rec.expiresAt}`,
      `Items:`,
      ...rec.items.map(
        (it, i) =>
          `  ${i + 1}) ${it.drugName} ${it.dosage} x ${it.frequency} ` +
          `(${it.route}) ${it.durationDays}d`,
      ),
      ``,
      `(Placeholder PDF — gerçek render FAZ-10+'da)`,
    ];
    const buf = Buffer.from(lines.join("\n"), "utf8");

    await this.audit.recordSimple(
      "audit:prescription.pdf",
      "prescription",
      id,
      "read",
      this.actorToAuditActor(actor),
      "info",
      { format: "placeholder-text", sizeBytes: buf.length },
    );

    return buf;
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
