/**
 * @file StockMovement (stok hareketi) service.
 * @module apps/api/modules/stock-movements/stock-movements.service
 *
 * @description GOAL-063 (FAZ-6) stok hareketleri ve sayım iş kuralları.
 * Tüm stok değişiklikleri **append-only** hareket tablosuna yazılır;
 * mevcut miktar (`netQuantity`) hareketlerin toplamından hesaplanır.
 *
 * İş kuralları:
 * - **createMovement** (public):
 *   - `productId` mevcut ve arşivsiz olmalı (404 VET-STOCK-0004 veya
 *     arşivli ise 409 VET-STOCK-0005).
 *   - `lotId` verildiyse mevcut ve arşivsiz olmalı (404 VET-STOCK-0005
 *     veya 409 VET-STOCK-0006).
 *   - `count_adjustment` / `waste` / `reversal` türlerinde `reason`
 *     zorunlu (422 VET-STOCK-0007).
 *   - `service` türünde ürün için stok hareketi reddedilir
 *     (422 VET-STOCK-0008).
 *   - Audit `audit:stock_movement.create` (info).
 * - **createSystemMovement**: purchase order receive, vaccine
 *   application gibi sistem akışları için. `sourceType` ve
 *   `sourceId` zorunlu; `reason` zorunlu DEĞİL (kaynak üst
 *   kayıtta tutulur). Aynı business rule'lar uygulanır.
 * - **reverseMovement**: orijinal hareketin tersine çevrilmesi
 *   (yeni `reversal` hareketi oluşturulur). `reason` zorunlu
 *   (422 VET-STOCK-0008). Aynı orijinale ait zaten bir ters
 *   kayıt varsa 409 VET-STOCK-0010. Audit `audit:stock_movement.reverse`.
 * - **listMovements**: tenant-scoped; ürün/lot/tür/tarih filtreleri.
 * - **listBalances**: tenant-scoped; ürün/lot bakiyeleri (ürün veya
 *   lot bazında).
 * - **getMovement**: cross-tenant → null.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Hareketler üzerinde fiziksel silme YOKTUR; iptal yalnızca
 *   ters kayıt ile.
 *
 * @since GOAL-063 (FAZ-6) stok hareketleri ve sayım core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type StockMovementSearchFilters,
  StockMovementsRepository,
} from "./stock-movements.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  addSignedDecimals,
  negateSignedDecimal,
  normalizeSignedDecimal,
  requiresReason,
  toStockMovement,
  type StockMovementRecord,
} from "../../common/stock-movements/stock-movement.types.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { ProductsService } from "../products/products.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  StockBalance,
  StockBalanceListResponse,
  StockMovement,
  StockMovementCreateInput,
  StockMovementFilters,
  StockMovementListResponse,
  StockMovementReverseInput,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Public service
 * -------------------------------------------------------------------------- */

@Injectable()
export class StockMovementsService {
  private readonly logger = new Logger(StockMovementsService.name);

  public constructor(
    private readonly repo: StockMovementsRepository,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // createMovement (public API)
  // =========================================================================

  /**
   * Manuel UI akışları için yeni stok hareketi oluşturur. Sistem
   * akışları (purchase order receive, vaccine application) bunun
   * yerine `createSystemMovement` çağırır; neden alanı opsiyoneldir.
   */
  public async createMovement(
    tenantId: string,
    input: StockMovementCreateInput,
    actor: ActorContext,
  ): Promise<StockMovement> {
    this.requireTenantScope(actor, tenantId);
    return this.createInternal(tenantId, input, actor, { isSystem: false });
  }

  // =========================================================================
  // createSystemMovement (purchase order, vaccine, vb.)
  // =========================================================================

  /**
   * Sistem akışları için stok hareketi oluşturur. `sourceType` ve
   * `sourceId` zorunlu; `reason` opsiyonel (üst kayıt zaten
   * taşır).
   *
   * @param systemMeta.systemSourceType — üst akış türü (ör.
   *   "purchase_order", "vaccine_application").
   * @param systemMeta.systemSourceId — üst kayıt ID'si.
   */
  public async createSystemMovement(
    tenantId: string,
    input: Omit<StockMovementCreateInput, "sourceType" | "sourceId">,
    actor: ActorContext,
    systemMeta: { systemSourceType: string; systemSourceId: string },
  ): Promise<StockMovement> {
    this.requireTenantScope(actor, tenantId);
    return this.createInternal(tenantId, input, actor, {
      isSystem: true,
      systemSourceType: systemMeta.systemSourceType,
      systemSourceId: systemMeta.systemSourceId,
    });
  }

  // =========================================================================
  // listMovements
  // =========================================================================

  public async listMovements(
    tenantId: string,
    filters: StockMovementFilters,
    actor: ActorContext,
  ): Promise<StockMovementListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, this.toSearchFilters(filters));
    return {
      items: result.items.map((r) => toStockMovement(r)),
      total: result.total,
    };
  }

  // =========================================================================
  // getMovement
  // =========================================================================

  public async getMovement(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<StockMovement | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? toStockMovement(rec) : null;
  }

  // =========================================================================
  // reverseMovement
  // =========================================================================

  /**
   * Bir hareketi tersine çevirir. Yeni bir `reversal` hareketi
   * oluşturulur; orijinal hareket değişmez (append-only).
   *
   * Aynı orijinale zaten bir ters kayıt yazıldıysa 409
   * VET-STOCK-0010. `reason` zorunlu (422 VET-STOCK-0008).
   */
  public async reverseMovement(
    tenantId: string,
    id: string,
    input: StockMovementReverseInput,
    actor: ActorContext,
  ): Promise<StockMovement> {
    this.requireTenantScope(actor, tenantId);
    const original = this.repo.findById(tenantId, id);
    if (!original) {
      throw new DomainError({
        errorCode: "VET-STOCK-0001",
        message: "Stok hareketi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-STOCK-0001",
        details: { id },
      });
    }
    // Zaten ters kayıt var mı?
    const existingReversals = this.repo.listByReversal(tenantId, id);
    if (existingReversals.length > 0) {
      throw new DomainError({
        errorCode: "VET-STOCK-0010",
        message: "Bu hareketin zaten bir ters kaydı var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-STOCK-0010",
        details: { id, reversalIds: existingReversals.map((r) => r.id) },
      });
    }

    // Ters quantity hesapla.
    const negated = negateSignedDecimal(original.quantity);
    if (negated === null) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "Ters kayıt quantity hesaplanamadı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { originalId: id, originalQuantity: original.quantity },
      });
    }

    const nowIso = new Date().toISOString();
    const id2 = this.repo.nextId(tenantId);
    const reversal: StockMovementRecord = {
      id: id2,
      tenantId,
      type: "reversal",
      productId: original.productId,
      lotId: original.lotId,
      quantity: negated,
      unitCost: original.unitCost,
      unitPrice: original.unitPrice,
      sourceType: "manual",
      sourceId: actor.actorId ?? "system",
      reversesMovementId: original.id,
      reason: input.reason,
      occurredAt: nowIso,
      notes: null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
    };
    this.repo.insert(reversal);

    await this.audit.recordSimple(
      "audit:stock_movement.reverse",
      "stock_movement",
      reversal.id,
      "reverse",
      this.actorToAuditActor(actor),
      "warning",
      {
        originalId: original.id,
        originalType: original.type,
        originalQuantity: original.quantity,
        reversalQuantity: reversal.quantity,
        reason: input.reason,
      },
    );

    return toStockMovement(reversal);
  }

  // =========================================================================
  // listBalances (ürün/lot bakiyeleri)
  // =========================================================================

  /**
   * Tenant-scoped tüm hareketleri tarayarak ürün/lot bakiyelerini
   * hesaplar. Sonuç: productId (+ lotId?) → netQuantity + movementCount.
   * Pilot kapsamda in-memory; büyük veri setleri için Prisma aggregate
   * query'si ile değiştirilecek.
   */
  public listBalances(
    tenantId: string,
    actor: ActorContext,
    filters?: { productId?: string; lotId?: string },
  ): StockBalanceListResponse {
    this.requireTenantScope(actor, tenantId);
    const map = new Map<
      string,
      { productId: string; lotId: string | null; net: string; count: number }
    >();
    for (const rec of this.repo.search(tenantId, {
      limit: 10000,
      offset: 0,
      productId: filters?.productId,
      lotId: filters?.lotId,
    }).items) {
      const key = `${rec.productId}|${rec.lotId ?? "null"}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          productId: rec.productId,
          lotId: rec.lotId,
          net: "0",
          count: 0,
        };
        map.set(key, entry);
      }
      const sum = addSignedDecimals(entry.net, rec.quantity);
      entry.net = sum ?? rec.quantity;
      entry.count += 1;
    }
    const items: StockBalance[] = Array.from(map.values()).map((e) => ({
      productId: e.productId,
      lotId: e.lotId,
      netQuantity: e.net,
      movementCount: e.count,
    }));
    return { items };
  }

  // =========================================================================
  // Private: createInternal
  // =========================================================================

  private async createInternal(
    tenantId: string,
    input: StockMovementCreateInput,
    actor: ActorContext,
    opts: {
      isSystem: boolean;
      systemSourceType?: string;
      systemSourceId?: string;
    },
  ): Promise<StockMovement> {
    // 1) Quantity normalize + sıfır kontrolü.
    const normalizedQuantity = normalizeSignedDecimal(input.quantity);
    if (normalizedQuantity === null || normalizedQuantity === "0") {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "Stok hareketi miktarı geçersiz veya sıfır",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { quantity: input.quantity },
      });
    }
    // 2) Ürün kontrolü.
    const product = await this.products.getProduct(
      tenantId,
      input.productId,
      actor,
    );
    if (!product) {
      throw new DomainError({
        errorCode: "VET-STOCK-0004",
        message: "Ürün bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-STOCK-0004",
        details: { productId: input.productId },
      });
    }
    if (product.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-STOCK-0009",
        message: "Arşivlenmiş ürün için stok hareketi oluşturulamaz",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-STOCK-0009",
        details: { productId: product.id },
      });
    }
    if (product.kind === "service") {
      throw new DomainError({
        errorCode: "VET-STOCK-0008",
        message:
          "Hizmet (service) türünde ürün için stok hareketi oluşturulamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-STOCK-0008",
        details: { productId: product.id },
      });
    }

    // 3) Lot kontrolü (verildiyse).
    if (input.lotId) {
      const lot = await this.inventory.getLot(tenantId, input.lotId, actor);
      if (!lot) {
        throw new DomainError({
          errorCode: "VET-STOCK-0005",
          message: "Lot bulunamadı",
          httpStatus: 404,
          severity: "warning",
          i18nKey: "error.VET-STOCK-0005",
          details: { lotId: input.lotId },
        });
      }
      if (lot.archivedAt !== null) {
        throw new DomainError({
          errorCode: "VET-STOCK-0006",
          message: "Arşivlenmiş lot için stok hareketi oluşturulamaz",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-STOCK-0006",
          details: { lotId: lot.id },
        });
      }
      if (lot.productId !== product.id) {
        throw new DomainError({
          errorCode: "VET-STOCK-0011",
          message: "Lot ile ürün eşleşmiyor",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-STOCK-0011",
          details: {
            productId: product.id,
            lotId: lot.id,
            lotProductId: lot.productId,
          },
        });
      }
    }

    // 4) Reason zorunlu mu?
    if (requiresReason(input.type) && !input.reason) {
      throw new DomainError({
        errorCode: "VET-STOCK-0007",
        message: "Bu hareket türü için neden (reason) zorunlu",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-STOCK-0007",
        details: { type: input.type },
      });
    }

    // 5) Sistem sourceType/sourceId hazırla.
    const sourceType = opts.isSystem
      ? (opts.systemSourceType ?? null)
      : (input.sourceType ?? null);
    const sourceId = opts.isSystem
      ? (opts.systemSourceId ?? null)
      : (input.sourceId ?? null);
    if (opts.isSystem && (!sourceType || !sourceId)) {
      throw new DomainError({
        errorCode: "VET-STOCK-0012",
        message: "Sistem hareketi için sourceType ve sourceId zorunlu",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-STOCK-0012",
      });
    }

    // 6) Unit cost/price normalize.
    const unitCost = input.unitCost ?? null;
    const unitPrice = input.unitPrice ?? null;

    // 7) Persist.
    const nowIso = input.occurredAt ?? new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const rec: StockMovementRecord = {
      id,
      tenantId,
      type: input.type,
      productId: product.id,
      lotId: input.lotId ?? null,
      quantity: normalizedQuantity,
      unitCost,
      unitPrice,
      sourceType,
      sourceId,
      reversesMovementId: null,
      reason: input.reason ?? null,
      occurredAt: nowIso,
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
      createdBy: actor.actorId ?? "system",
    };
    this.repo.insert(rec);

    // 8) Audit.
    await this.audit.recordSimple(
      "audit:stock_movement.create",
      "stock_movement",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        type: rec.type,
        productId: rec.productId,
        lotId: rec.lotId,
        quantity: rec.quantity,
        unitCost: rec.unitCost,
        unitPrice: rec.unitPrice,
        sourceType: rec.sourceType,
        sourceId: rec.sourceId,
        reason: rec.reason,
        isSystem: opts.isSystem,
      },
    );

    return toStockMovement(rec);
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

  private toSearchFilters(f: StockMovementFilters): StockMovementSearchFilters {
    return {
      productId: f.productId,
      lotId: f.lotId,
      type: f.type,
      types: f.types,
      sourceType: f.sourceType,
      sourceId: f.sourceId,
      occurredFrom: f.occurredFrom,
      occurredTo: f.occurredTo,
      search: f.search,
      limit: f.limit,
      offset: f.offset,
    };
  }
}
