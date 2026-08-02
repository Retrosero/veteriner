/**
 * @file ClinicalConsumption (klinik tüketim) service.
 * @module apps/api/modules/clinical-consumption/clinical-consumption.service
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü
 * iş kuralları. Muayene/aşı/ameliyat/yatış/reçete sırasında kullanılan
 * ürünlerin klinik tüketim kaydı olarak tutulmasını ve stoktan
 * otomatik düşülmesini sağlar.
 *
 * İş kuralları:
 * - `recordForExamination` / `recordForVaccination` / `recordForPrescription`:
 *   her satır için `StockMovementsService.createSystemMovement`
 *   çağrısı ile `type='clinical_use'` (veya `type='vaccination'`)
 *   hareketi oluşturulur. Negatif işaretle (stok çıkışı) yazılır.
 * - `create` (generic): API'dan doğrudan tüketim kaydı (muayene/
 *   ameliyat/yatış için pratik kullanım).
 * - `cancel`: `status='recorded'` → `cancelled`; her satır için
 *   `StockMovementsService.reverseMovement` çağrılır (ters kayıt).
 *   `cancelReason` zorunlu (422 VET-CLINICAL_CONSUMPTION-0005).
 * - `getById` / `list`: tenant-scoped; cross-tenant → null.
 *
 * **Cross-module entegrasyon:**
 * - `StockMovementsService.createSystemMovement` — stok düşümü ve
 *   ters kayıt.
 * - `ProductsService.getProduct` — ürün varlık/arşiv kontrolü.
 * - `InventoryService.getLot` — lot varlık/arşiv kontrolü (vaccination
 *   için zorunlu; diğer context'ler için önerilir).
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Tüketim kayıtları üzerinde fiziksel silme YOKTUR; iptal yalnızca
 *   ters kayıt ile.
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type ClinicalConsumptionSearchFilters,
  ClinicalConsumptionRepository,
} from "./clinical-consumption.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import {
  isLotRequiredForContext,
  normalizeConsumptionQuantity,
  toClinicalConsumption,
  validateLineForContext,
  type ClinicalConsumptionRecord,
} from "../../common/clinical-consumption/clinical-consumption.types.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  negateSignedDecimal,
  normalizeSignedDecimal,
} from "../../common/stock-movements/stock-movement.types.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { ProductsService } from "../products/products.service.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  ClinicalConsumption,
  ClinicalConsumptionCancelInput,
  ClinicalConsumptionContext,
  ClinicalConsumptionCreateInput,
  ClinicalConsumptionFilters,
  ClinicalConsumptionLine,
  ClinicalConsumptionListResponse,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Public service
 * -------------------------------------------------------------------------- */

@Injectable()
export class ClinicalConsumptionService {
  private readonly logger = new Logger(ClinicalConsumptionService.name);

  public constructor(
    private readonly repo: ClinicalConsumptionRepository,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly stockMovements: StockMovementsService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // create (generic API + system hook'ları)
  // =========================================================================

  /**
   * Manuel klinik tüketim kaydı oluşturur. Stok düşümü
   * `StockMovementsService.createSystemMovement` üzerinden yapılır;
   * her satır için bir hareket oluşturulur.
   * @param tenantId
   * @param input
   * @param actor
   */
  public async create(
    tenantId: string,
    input: ClinicalConsumptionCreateInput,
    actor: ActorContext,
  ): Promise<ClinicalConsumption> {
    this.requireTenantScope(actor, tenantId);
    return this.createInternal(tenantId, input, actor);
  }

  // =========================================================================
  // recordForPrescription — reçete dispense otomasyonu
  // =========================================================================

  /**
   * Reçete dispense anında otomatik tüketim kaydı oluşturur. Prescription
   * dispense hook'undan çağrılır; reçete içindeki ürünler (item.productId
   * opsiyonel — pilot kapsamda ürün bağı zorunlu değil) klinik tüketim
   * kaydına satır olarak yazılır.
   *
   * `prescriptionId` bağlamı `contextRefId` olarak kullanılır; bir reçete
   * için en fazla 1 aktif tüketim kaydı olabilir (idempotent — varsa
   * mevcut döner, yenisi oluşturulmaz).
   * @param tenantId
   * @param prescriptionId
   * @param patientId
   * @param lines
   * @param actor
   */
  public async recordForPrescription(
    tenantId: string,
    prescriptionId: string,
    patientId: string | null,
    lines: ClinicalConsumptionLine[],
    actor: ActorContext,
  ): Promise<ClinicalConsumption | null> {
    this.requireTenantScope(actor, tenantId);
    if (lines.length === 0) return null;
    // Idempotency: aynı prescription için zaten kayıt varsa yenisi oluşturma.
    const existing = (await this.repo
      .persistedByContextRef(tenantId, prescriptionId))
      .find((r) => r.context === "prescription" && r.status === "recorded");
    if (existing) return toClinicalConsumption(existing);

    return this.createInternal(
      tenantId,
      {
        context: "prescription",
        contextRefId: prescriptionId,
        patientId: patientId ?? undefined,
        lines,
        occurredAt: new Date().toISOString(),
      },
      actor,
    );
  }

  // =========================================================================
  // cancel
  // =========================================================================

  /**
   * Tüketim kaydını iptal eder. Her satır için
   * `StockMovementsService.reverseMovement` çağrılır; ters kayıt
   * stok bakiyesini geri getirir. İptal sonrası status='cancelled'.
   *
   * `cancelReason` zorunlu (422 VET-CLINICAL_CONSUMPTION-0005).
   * Zaten iptal edilmiş kayıt tekrar iptal edilemez
   * (409 VET-CLINICAL_CONSUMPTION-0006).
   * @param tenantId
   * @param id
   * @param input
   * @param actor
   */
  public async cancel(
    tenantId: string,
    id: string,
    input: ClinicalConsumptionCancelInput,
    actor: ActorContext,
  ): Promise<ClinicalConsumption> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedById(tenantId, id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-CLINICAL_CONSUMPTION-0001",
        message: "Klinik tüketim kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINICAL_CONSUMPTION-0001",
        details: { id },
      });
    }
    if (rec.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-CLINICAL_CONSUMPTION-0006",
        message: "Bu tüketim kaydı zaten iptal edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CLINICAL_CONSUMPTION-0006",
        details: { id, cancelledAt: rec.cancelledAt },
      });
    }
    if (!input.cancelReason || input.cancelReason.trim().length === 0) {
      throw new DomainError({
        errorCode: "VET-CLINICAL_CONSUMPTION-0005",
        message: "İptal nedeni zorunlu",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINICAL_CONSUMPTION-0005",
      });
    }

    // Kalıcı modda ters hareketler ile durum değişimi tek transaction'da
    // yapılır. Test/uyumluluk modunda aşağıdaki eski servis yolu kullanılır.
    const atomicCancelled = await this.repo.cancelWithReversals(
      tenantId,
      rec.id,
      actor.actorId ?? "system",
      input.cancelReason,
    );
    if (atomicCancelled) {
      await this.audit.recordSimple(
        "audit:clinical_consumption.cancel",
        "clinical_consumption",
        rec.id,
        "cancel",
        this.actorToAuditActor(actor),
        "warning",
        { context: rec.context, contextRefId: rec.contextRefId, patientId: rec.patientId, lineCount: rec.lines.length, stockMovementIds: rec.stockMovementIds, cancelReason: input.cancelReason },
      );
      return toClinicalConsumption(atomicCancelled);
    }

    // Her satır için ters kayıt oluştur.
    for (const movementId of rec.stockMovementIds) {
      try {
        await this.stockMovements.reverseMovement(
          tenantId,
          movementId,
          {
            reason: `clinical_consumption_cancel:${rec.id}:${input.cancelReason}`,
          },
          actor,
        );
      } catch (err) {
        // Zaten ters kayıt var ise (idempotent) sorun değil; diğer
        // hatalar propagate olur.
        if (err instanceof DomainError && err.errorCode === "VET-STOCK-0010") {
          continue;
        }
        throw err;
      }
    }

    const nowIso = new Date().toISOString();
    const cancelled: ClinicalConsumptionRecord = {
      ...rec,
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: actor.actorId ?? "system",
      cancelReason: input.cancelReason,
    };
    const persisted = await this.repo.persistedCancel(tenantId, rec.id, cancelled);
    if (!persisted) {
      throw new DomainError({ errorCode: "VET-CLINICAL_CONSUMPTION-0001", message: "Klinik tüketim kaydı bulunamadı", httpStatus: 404, severity: "warning", i18nKey: "error.VET-CLINICAL_CONSUMPTION-0001", details: { id } });
    }

    await this.audit.recordSimple(
      "audit:clinical_consumption.cancel",
      "clinical_consumption",
      rec.id,
      "cancel",
      this.actorToAuditActor(actor),
      "warning",
      {
        context: rec.context,
        contextRefId: rec.contextRefId,
        patientId: rec.patientId,
        lineCount: rec.lines.length,
        stockMovementIds: rec.stockMovementIds,
        cancelReason: input.cancelReason,
      },
    );

    return toClinicalConsumption(persisted);
  }

  // =========================================================================
  // getById
  // =========================================================================

  public async getById(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<ClinicalConsumption | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedById(tenantId, id);
    return rec ? toClinicalConsumption(rec) : null;
  }

  // =========================================================================
  // list
  // =========================================================================

  public async list(
    tenantId: string,
    filters: ClinicalConsumptionFilters,
    actor: ActorContext,
  ): Promise<ClinicalConsumptionListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearch(tenantId, this.toSearchFilters(filters));
    return {
      items: result.items.map((r) => toClinicalConsumption(r)),
      total: result.total,
    };
  }

  // =========================================================================
  // Private: createInternal
  // =========================================================================

  private async createInternal(
    tenantId: string,
    input: ClinicalConsumptionCreateInput,
    actor: ActorContext,
  ): Promise<ClinicalConsumption> {
    const context: ClinicalConsumptionContext = input.context;

    // 1) Satır sayısı kontrolü.
    if (input.lines.length === 0) {
      throw new DomainError({
        errorCode: "VET-CLINICAL_CONSUMPTION-0002",
        message: "Tüketim kaydı en az bir satır içermelidir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINICAL_CONSUMPTION-0002",
      });
    }

    // 2) Lot zorunluluğu (vaccination).
    if (isLotRequiredForContext(context)) {
      for (const line of input.lines) {
        if (!validateLineForContext(context, line)) {
          throw new DomainError({
            errorCode: "VET-CLINICAL_CONSUMPTION-0003",
            message: "Aşı uygulaması için her satırda lot bilgisi zorunludur",
            httpStatus: 422,
            severity: "warning",
            i18nKey: "error.VET-CLINICAL_CONSUMPTION-0003",
            details: { productId: line.productId },
          });
        }
      }
    }

    // 3) Her satır için normalize + ürün/lot doğrulaması + stok hareketi oluştur.
    const stockMovementIds: string[] = [];
    const nowIso = input.occurredAt ?? new Date().toISOString();

    for (const line of input.lines) {
      const normalizedQuantity = normalizeConsumptionQuantity(line.quantity);
      if (normalizedQuantity === null) {
        throw new DomainError({
          errorCode: "VET-CLINICAL_CONSUMPTION-0002",
          message: "Geçersiz veya sıfır tüketim miktarı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CLINICAL_CONSUMPTION-0002",
          details: { productId: line.productId, quantity: line.quantity },
        });
      }

      // Ürün kontrolü (ProductsService üzerinden).
      const product = await this.products.getProduct(
        tenantId,
        line.productId,
        actor,
      );
      if (!product) {
        throw new DomainError({
          errorCode: "VET-CLINICAL_CONSUMPTION-0004",
          message: "Tüketim satırındaki ürün bulunamadı",
          httpStatus: 404,
          severity: "warning",
          i18nKey: "error.VET-CLINICAL_CONSUMPTION-0004",
          details: { productId: line.productId },
        });
      }
      if (product.archivedAt !== null) {
        throw new DomainError({
          errorCode: "VET-CLINICAL_CONSUMPTION-0007",
          message: "Arşivlenmiş ürün için klinik tüketim kaydı oluşturulamaz",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-CLINICAL_CONSUMPTION-0007",
          details: { productId: product.id },
        });
      }
      if (product.kind === "service") {
        throw new DomainError({
          errorCode: "VET-CLINICAL_CONSUMPTION-0007",
          message:
            "Hizmet (service) türünde ürün için klinik tüketim kaydı oluşturulamaz",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-CLINICAL_CONSUMPTION-0007",
          details: { productId: product.id },
        });
      }

      // Lot kontrolü (verildiyse).
      if (line.lotId) {
        const lot = await this.inventory.getLot(tenantId, line.lotId, actor);
        if (!lot) {
          throw new DomainError({
            errorCode: "VET-CLINICAL_CONSUMPTION-0004",
            message: "Tüketim satırındaki lot bulunamadı",
            httpStatus: 404,
            severity: "warning",
            i18nKey: "error.VET-CLINICAL_CONSUMPTION-0004",
            details: { lotId: line.lotId },
          });
        }
        if (lot.archivedAt !== null) {
          throw new DomainError({
            errorCode: "VET-CLINICAL_CONSUMPTION-0007",
            message: "Arşivlenmiş lot için klinik tüketim kaydı oluşturulamaz",
            httpStatus: 409,
            severity: "warning",
            i18nKey: "error.VET-CLINICAL_CONSUMPTION-0007",
            details: { lotId: lot.id },
          });
        }
        if (lot.productId !== product.id) {
          throw new DomainError({
            errorCode: "VET-CLINICAL_CONSUMPTION-0004",
            message: "Lot ile ürün eşleşmiyor",
            httpStatus: 422,
            severity: "warning",
            i18nKey: "error.VET-CLINICAL_CONSUMPTION-0004",
            details: {
              productId: product.id,
              lotId: lot.id,
              lotProductId: lot.productId,
            },
          });
        }
      }

      // Stok hareketi oluştur (negatif işaretli).
      const signedQuantity = negateSignedDecimal(normalizedQuantity);
      if (signedQuantity === null) {
        throw new DomainError({
          errorCode: "VET-CLINICAL_CONSUMPTION-0002",
          message: "Stok hareketi miktarı hesaplanamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CLINICAL_CONSUMPTION-0002",
          details: { productId: line.productId, quantity: normalizedQuantity },
        });
      }
      const stockType =
        context === "vaccination" ? "vaccination" : "clinical_use";
      const movement = await this.stockMovements.createSystemMovement(
        tenantId,
        {
          type: stockType,
          productId: product.id,
          lotId: line.lotId,
          quantity: signedQuantity,
          unitCost: line.unitCost,
          notes: line.notes,
          occurredAt: nowIso,
        },
        actor,
        {
          systemSourceType: "clinical_consumption",
          systemSourceId: `pending:${tenantId}:${input.context}:${input.contextRefId}:${line.productId}`,
        },
      );
      stockMovementIds.push(movement.id);
    }

    // 4) Persist record.
    const id = this.repo.nextId(tenantId);
    const rec: ClinicalConsumptionRecord = {
      id,
      tenantId,
      context,
      contextRefId: input.contextRefId,
      patientId: input.patientId ?? null,
      lines: input.lines,
      notes: input.notes ?? null,
      status: "recorded",
      occurredAt: nowIso,
      createdAt: new Date().toISOString(),
      createdBy: actor.actorId ?? "system",
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      stockMovementIds,
    };
    await this.repo.persist(rec);

    // 5) Audit.
    await this.audit.recordSimple(
      "audit:clinical_consumption.create",
      "clinical_consumption",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        context,
        contextRefId: input.contextRefId,
        patientId: rec.patientId,
        lineCount: input.lines.length,
        stockMovementIds,
      },
    );

    return toClinicalConsumption(rec);
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

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

  private toSearchFilters(
    f: ClinicalConsumptionFilters,
  ): ClinicalConsumptionSearchFilters {
    return {
      context: f.context,
      contextRefId: f.contextRefId,
      patientId: f.patientId,
      status: f.status,
      occurredFrom: f.occurredFrom,
      occurredTo: f.occurredTo,
      limit: f.limit ?? 50,
      offset: f.offset ?? 0,
    };
  }

  // Re-export for tests; normalizeSignedDecimal is used by some callers.
  public static normalizeSignedDecimalForTest(value: string): string | null {
    return normalizeSignedDecimal(value);
  }
}
