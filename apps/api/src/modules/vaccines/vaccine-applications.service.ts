/**
 * @file Vaccine application (aşı uygulama) service.
 * @module apps/api/modules/vaccines/vaccine-applications.service
 *
 * @description GOAL-051 aşı uygulama kaydı + GOAL-054 amendment
 * iş kuralları. Hayvana uygulanan aşının klinik kaydı + stok
 * düşümünü atomik olarak yapar. Düzeltme (amend) ve iptal
 * (cancel) ile klinik kayıt politikası korunur.
 *
 * İş kuralları:
 * - `createApplication`:
 *   - patient aynı tenant'ta mı (cross-tenant → 404 VET-CLINIC-0001).
 *   - protocol aynı tenant'ta mı (cross-tenant → 404 VET-VACC-0004).
 *   - protocol arşivli mi (evet → 409 VET-VACC-0005).
 *   - protocol'un species'ı patient türü ile uyumlu mu
 *     (değilse → 422 VET-VACC-0006).
 *   - lot SKT'si geçmiş mi (evet → 422 VET-VACC-0002).
 *   - lot yeterli stok var mı (yok → 422 VET-VACC-0003).
 *   - doz: client override > protokol defaultDose.
 *   - aşı kaydı + stok düşümü atomik. Hata durumunda ikisi de geri
 *     alınır (stock.move başarısızsa record insert edilmez).
 *   - Audit `audit:vaccine.application.create` (info).
 * - `listApplications`: tenant-scoped; patientId / protocolId /
 *   status / from / to filtreleri; cancelled default hariç.
 * - `getApplication`: tenant-scoped; cross-tenant → null.
 * - `amendApplication` (GOAL-054):
 *   - status='active' değilse → 409 VET-VACC-0007.
 *   - status='amended', amendedAt+amendedBy+amendedReason.
 *   - `dose` / `nextDueDate` / `notes` değişirse stok etkisi yok.
 *   - `lot` değişirse:
 *       * Yeni lot SKT'si geçmişse → 422 VET-VACC-0010.
 *       * Yeni lot yeterli stok yoksa → 422 VET-VACC-0009.
 *       * Eski lot'a ters kayıt + yeni lot'tan düşüm.
 *       * Hareket ID'leri `stockMovementIds`'e append edilir.
 *   - Audit `audit:vaccine.application.amend` (warning);
 *     `lotChange` varsa audit detail'inde before/after.
 * - `cancelApplication`: status='cancelled' ise → 409
 *   VET-VACC-0008. status='cancelled', cancelledAt+cancellationReason.
 *   Tüm bağlı stok hareketleri ters kayıt ile geri alınır.
 *   Audit `audit:vaccine.application.cancel` (warning).
 * - `listByPatient`: hasta zaman çizelgesi için kısa liste.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Fiziksel silme YOKTUR.
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 * @updated GOAL-054 (FAZ-5) aşı amendment ve düzeltme core
 *   (lot değişikliği + atomik stok ters/yeni hareket)
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  VaccineStockLedger,
  type StockMovement,
} from "../../common/vaccines/vaccine-stock-ledger.js";
import {
  isLotExpired,
  resolveApplicationDose,
  toVaccineApplication,
  type VaccineApplicationRecord,
} from "../../common/vaccines/vaccine-application.types.js";
import { VaccinesService } from "./vaccines.service.js";
import { PatientsService } from "../patients/patients.service.js";
import type {
  VaccineApplication,
  VaccineApplicationAmendInput,
  VaccineApplicationCancelInput,
  VaccineApplicationCreateInput,
  VaccineApplicationFilters,
  VaccineApplicationListResponse,
} from "@vetniva/contracts";

import {
  VaccineApplicationsRepository,
  type VaccineApplicationPatch,
} from "./vaccine-applications.repository.js";

@Injectable()
export class VaccineApplicationsService {
  private readonly logger = new Logger(VaccineApplicationsService.name);

  public constructor(
    private readonly repo: VaccineApplicationsRepository,
    private readonly stock: VaccineStockLedger,
    private readonly vaccines: VaccinesService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createApplication
  // -------------------------------------------------------------------------

  public async createApplication(
    tenantId: string,
    input: VaccineApplicationCreateInput,
    actor: ActorContext,
  ): Promise<VaccineApplication> {
    this.requireTenantScope(actor, tenantId);

    // 1) Patient doğrula (cross-tenant → 404).
    const patient = await this.patients.findById(
      tenantId,
      input.patientId,
      actor,
    );
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { patientId: input.patientId },
      });
    }

    // 2) Protocol doğrula (cross-tenant → 404, arşivli → 409).
    const protocol = await this.vaccines.getProtocol(
      tenantId,
      input.protocolId,
      actor,
    );
    if (!protocol) {
      throw new DomainError({
        errorCode: "VET-VACC-0004",
        message: "Aşı protokolü bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-VACC-0004",
        details: { protocolId: input.protocolId },
      });
    }
    if (protocol.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-VACC-0005",
        message: "Arşivlenmiş aşı protokolü uygulanamaz",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-VACC-0005",
        details: { protocolId: input.protocolId },
      });
    }

    // 3) Species uyumu. 'all' her türe uygulanabilir.
    if (
      protocol.species !== "all" &&
      protocol.species !== patient.species
    ) {
      throw new DomainError({
        errorCode: "VET-VACC-0006",
        message:
          "Aşı protokolü türü, hastanın türüyle uyumlu değil",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VACC-0006",
        details: {
          protocolSpecies: protocol.species,
          patientSpecies: patient.species,
        },
      });
    }

    // 4) SKT kontrolü.
    if (isLotExpired(input.lot.expiryDate, input.applicationDate)) {
      throw new DomainError({
        errorCode: "VET-VACC-0002",
        message: "Aşı lotunun son kullanma tarihi geçmiş",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VACC-0002",
        details: {
          lot: input.lot.lot,
          expiryDate: input.lot.expiryDate,
        },
      });
    }

    // 5) Doz çözümle.
    const dose = resolveApplicationDose(input.dose, protocol.defaultDose);

    // 6) Stok düşümünü dene. Yeterli değilse 422.
    const id = this.repo.nextId(tenantId);
    const administeredBy = input.administeredBy ?? actor.actorId ?? "system";
    const movement = this.stock.decrement({
      tenantId,
      stockProductId: input.lot.stockProductId,
      lot: input.lot.lot,
      expiryDate: input.lot.expiryDate,
      quantity: 1, // her uygulama 1 birim stok düşürür
      applicationId: id,
      createdBy: administeredBy,
    });
    if (!movement) {
      // Yetersiz stok veya lot yok.
      const balance = this.stock.getBalance({
        tenantId,
        stockProductId: input.lot.stockProductId,
        lot: input.lot.lot,
        expiryDate: input.lot.expiryDate,
      });
      throw new DomainError({
        errorCode: "VET-VACC-0003",
        message: "Yetersiz stok",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VACC-0003",
        details: {
          lot: input.lot.lot,
          availableQuantity: balance,
        },
      });
    }

    // 7) Kayıt oluştur.
    const nowIso = new Date().toISOString();
    const record: VaccineApplicationRecord = this.repo.toRecord({
      id,
      tenantId,
      patientId: patient.id,
      protocolId: protocol.id,
      lot: input.lot,
      dose,
      administeredBy,
      applicationDate: input.applicationDate,
      nextDueDate: input.nextDueDate ?? null,
      notes: input.notes ?? null,
      status: "active",
      createdAt: nowIso,
      createdBy: administeredBy,
      updatedAt: nowIso,
      amendedAt: null,
      amendedBy: null,
      amendedReason: null,
      cancelledAt: null,
      cancellationReason: null,
      stockMovementIds: [movement.id],
    });
    this.repo.insert(record);

    // 8) Audit.
    await this.audit.recordSimple(
      "audit:vaccine.application.create",
      "vaccine_application",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: patient.id,
        protocolId: protocol.id,
        protocolName: protocol.name,
        lot: input.lot.lot,
        stockProductId: input.lot.stockProductId,
        expiryDate: input.lot.expiryDate,
        doseAmount: dose?.amount ?? null,
        doseUnit: dose?.unit ?? null,
        applicationDate: input.applicationDate,
        nextDueDate: input.nextDueDate ?? null,
        stockMovementId: movement.id,
      },
    );

    return toVaccineApplication(record);
  }

  // -------------------------------------------------------------------------
  // listApplications
  // -------------------------------------------------------------------------

  public async listApplications(
    tenantId: string,
    filters: VaccineApplicationFilters,
    actor: ActorContext,
  ): Promise<VaccineApplicationListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      patientId: filters.patientId,
      protocolId: filters.protocolId,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      includeCancelled: filters.status === "cancelled",
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toVaccineApplication(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getApplication
  // -------------------------------------------------------------------------

  public async getApplication(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<VaccineApplication | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? toVaccineApplication(rec) : null;
  }

  // -------------------------------------------------------------------------
  // listByPatient
  // -------------------------------------------------------------------------

  public async listByPatient(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
    limit: number = 50,
  ): Promise<VaccineApplication[]> {
    this.requireTenantScope(actor, tenantId);
    const recs = this.repo.listByPatient(tenantId, patientId, limit);
    return recs.map((r) => toVaccineApplication(r));
  }

  // -------------------------------------------------------------------------
  // amendApplication
  // -------------------------------------------------------------------------

  public async amendApplication(
    tenantId: string,
    id: string,
    input: VaccineApplicationAmendInput,
    actor: ActorContext,
  ): Promise<VaccineApplication> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı uygulama kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status !== "active") {
      throw new DomainError({
        errorCode: "VET-VACC-0007",
        message: "Yalnızca aktif aşı kayıtları düzeltilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-VACC-0007",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    const amendedBy = actor.actorId ?? "system";
    const before = {
      dose: existing.dose,
      nextDueDate: existing.nextDueDate,
      notes: existing.notes,
      lot: existing.lot,
    };

    // GOAL-054: lot değişimi atomik — yeni lot önce valide
    // edilir (SKT + yeterli stok), sonra eski lot ters kayıt +
    // yeni lot düşüm yapılır. Bu sıralama, yetersiz stok veya
    // SKT geçmiş senaryolarında eski lot'u güvenli tutar.
    let lotChange: {
      before: typeof existing.lot;
      after: typeof existing.lot;
      reversedMovementId: string;
      newMovementId: string;
    } | null = null;
    const newMovementIds: string[] = [];
    let newLot: typeof existing.lot | null = null;
    if (
      input.lot !== undefined &&
      !this.repo.isSameLot(existing.lot, input.lot)
    ) {
      // 1) Yeni lot SKT kontrolü.
      if (isLotExpired(input.lot.expiryDate, new Date().toISOString())) {
        throw new DomainError({
          errorCode: "VET-VACC-0010",
          message: "Yeni lot'un son kullanma tarihi geçmiş",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-VACC-0010",
          details: {
            lot: input.lot.lot,
            expiryDate: input.lot.expiryDate,
          },
        });
      }

      // 2) Yeni lot'tan düşüm dene. Yeterli değilse 422 — eski
      //    lot'a dokunulmamış olur (atomik).
      const administeredBy = existing.administeredBy;
      const provisionalNewMovement = this.stock.decrement({
        tenantId,
        stockProductId: input.lot.stockProductId,
        lot: input.lot.lot,
        expiryDate: input.lot.expiryDate,
        quantity: 1,
        applicationId: existing.id,
        createdBy: administeredBy,
      });
      if (!provisionalNewMovement) {
        const balance = this.stock.getBalance({
          tenantId,
          stockProductId: input.lot.stockProductId,
          lot: input.lot.lot,
          expiryDate: input.lot.expiryDate,
        });
        throw new DomainError({
          errorCode: "VET-VACC-0009",
          message: "Yeni lot için yetersiz stok",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-VACC-0009",
          details: {
            lot: input.lot.lot,
            availableQuantity: balance,
          },
        });
      }
      // Geçici hareket — başarılı olursa kalıcı, başarısız
      // olursa (eski reverse başarısız) iade edilecek. Reverse
      // başarısız olursa kritik log üretiriz.
      newMovementIds.push(provisionalNewMovement.id);

      // 3) Eski lot'a ters kayıt. Hareket ID'leri uygulama
      //    kaydında tutulur; amortismana uğramış (voided)
      //    hareketi tersine çevirmiyoruz.
      const reversedMovementIds: string[] = [];
      for (const movementId of existing.stockMovementIds) {
        const reversed = this.stock.reverse(
          tenantId,
          movementId,
          amendedBy,
        );
        if (!reversed) {
          // Reverse başarısız: yeni lot'tan düşülen hareketi
          // geri almak için iade (negative) hareketi oluştur.
          // Bu senaryo normalde olmamalı (ledger tutarlı);
          // olursa critical log + audit.
          await this.audit.recordSimple(
            "audit:vaccine.application.amend",
            "vaccine_application",
            id,
            "amend",
            this.actorToAuditActor(actor),
            "critical",
            {
              reason: input.reason,
              error:
                "Stok ters kayıt başarısız; yeni lot hareketi iade edildi",
              before,
              after: {
                dose: existing.dose,
                nextDueDate: existing.nextDueDate,
                notes: existing.notes,
                lot: input.lot,
              },
            },
          );
          throw new DomainError({
            errorCode: "VET-VACC-0001",
            message: "Stok hareketi tersine çevrilemedi",
            httpStatus: 500,
            severity: "critical",
            i18nKey: "error.VET-VACC-0001",
            details: { id, movementId },
          });
        }
        reversedMovementIds.push(reversed.id);
      }

      newMovementIds.unshift(...reversedMovementIds);
      newLot = input.lot;
      lotChange = {
        before: existing.lot,
        after: input.lot,
        reversedMovementId: reversedMovementIds[0] ?? "",
        newMovementId: provisionalNewMovement.id,
      };
    }

    const patch: VaccineApplicationPatch = {
      status: "amended",
      updatedAt: nowIso,
      amendedAt: nowIso,
      amendedBy,
      amendedReason: input.reason,
    };
    if (input.dose !== undefined) patch.dose = input.dose;
    if (input.nextDueDate !== undefined) patch.nextDueDate = input.nextDueDate;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (newLot !== null) patch.lot = newLot;
    if (newMovementIds.length > 0) {
      patch.stockMovementIds = [
        ...existing.stockMovementIds,
        ...newMovementIds,
      ];
    }
    const updated = this.repo.update(tenantId, id, patch);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı uygulama kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    const auditDetail: Record<string, unknown> = {
      reason: input.reason,
      before: {
        dose: before.dose,
        nextDueDate: before.nextDueDate,
        notes: before.notes,
      },
      after: {
        dose: updated.dose,
        nextDueDate: updated.nextDueDate,
        notes: updated.notes,
      },
    };
    if (lotChange !== null) {
      auditDetail.lotChange = {
        before: lotChange.before,
        after: lotChange.after,
        reversedMovementId: lotChange.reversedMovementId,
        newMovementId: lotChange.newMovementId,
      };
    }

    await this.audit.recordSimple(
      "audit:vaccine.application.amend",
      "vaccine_application",
      id,
      "amend",
      this.actorToAuditActor(actor),
      "warning",
      auditDetail,
    );

    return toVaccineApplication(updated);
  }

  // -------------------------------------------------------------------------
  // cancelApplication
  // -------------------------------------------------------------------------

  public async cancelApplication(
    tenantId: string,
    id: string,
    input: VaccineApplicationCancelInput,
    actor: ActorContext,
  ): Promise<VaccineApplication> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı uygulama kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-VACC-0008",
        message: "Aşı kaydı zaten iptal edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-VACC-0008",
        details: { id },
      });
    }

    // Stok hareketlerini tersine çevir. Hata olursa domain error.
    const newMovementIds: string[] = [];
    for (const movementId of existing.stockMovementIds) {
      const reversed = this.stock.reverse(
        tenantId,
        movementId,
        actor.actorId ?? "system",
      );
      if (!reversed) {
        throw new DomainError({
          errorCode: "VET-VACC-0001",
          message: "Stok hareketi tersine çevrilemedi",
          httpStatus: 500,
          severity: "critical",
          i18nKey: "error.VET-VACC-0001",
          details: { id, movementId },
        });
      }
      newMovementIds.push(reversed.id);
    }

    const nowIso = new Date().toISOString();
    const cancelledBy = actor.actorId ?? "system";
    const updated = this.repo.update(tenantId, id, {
      status: "cancelled",
      updatedAt: nowIso,
      cancelledAt: nowIso,
      cancellationReason: input.reason,
      stockMovementIds: [
        ...existing.stockMovementIds,
        ...newMovementIds,
      ],
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Aşı uygulama kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:vaccine.application.cancel",
      "vaccine_application",
      id,
      "cancel",
      this.actorToAuditActor(actor),
      "warning",
      {
        reason: input.reason,
        patientId: existing.patientId,
        protocolId: existing.protocolId,
        reversedStockMovementIds: newMovementIds,
      },
    );

    return toVaccineApplication(updated);
  }

  // -------------------------------------------------------------------------
  // Stok yardımcısı (test/admin)
  // -------------------------------------------------------------------------

  /**
   * Lot'a başlangıç stoğu ekler. Faz 6'da bu doğrudan
   * `StockProduct` üzerinden yapılacak; burada yalnızca
   * test/admin senaryoları için public.
   */
  public addStock(args: {
    tenantId: string;
    stockProductId: string;
    lot: string;
    expiryDate: string;
    quantity: number;
  }): void {
    this.stock.addStock(args);
  }

  public getStockBalance(args: {
    tenantId: string;
    stockProductId: string;
    lot: string;
    expiryDate: string;
  }): number {
    return this.stock.getBalance(args);
  }

  public listStockMovements(
    tenantId: string,
    applicationId?: string,
  ): StockMovement[] {
    return this.stock.listMovements(tenantId, applicationId);
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
      actorType: actor.actorType as "user" | "system",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
