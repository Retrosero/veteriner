/**
 * @file Düşük stok ve SKT uyarıları service.
 * @module apps/api/modules/stock-alerts/stock-alerts.service
 *
 * @description GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları iş
 * kuralları. İki uyarı türü:
 * - **LowStockAlert**: ürünün net stoğu `lowStockThreshold`
 *   altına düştüğünde tetiklenir. `purchaseTracked=true` ve
 *   arşivsiz ürünler için.
 * - **ExpiringLotAlert**: aktif lot için `expiryDate <= now +
 *   daysAhead` olduğunda tetiklenir.
 *
 * İş kuralları:
 * - **Compute on read**: uyarılar her `listFor*` çağrısında (veya
 *   `refresh`'te) yeniden hesaplanır. Hesaplanan sonuçlar
 *   transient'tır; ack'lar ayrı tabloda (StockAlertAcksRepository)
 *   tutulur.
 * - **listLowStock**:
 *   - Tüm aktif (arşivsiz) ürünler taranır.
 *   - `purchaseTracked=false` veya `lowStockThreshold=null` ürünler
 *     atlanır.
 *   - `currentQuantity <= threshold` ise uyarı oluşur.
 *   - `currentQuantity <= 0` → severity = "critical".
 *   - Ack varsa status = "acknowledged" korunur; aksi "active".
 *   - Stok eşiğin üstüne çıktıysa ack korunur ama status
 *     "resolved" yapılır; listede `status="active"` filtresi
 *     varsa görünmez.
 * - **listExpiringLots**:
 *   - Tüm aktif (arşivsiz) lotlar taranır.
 *   - Lot ürünü arşivsiz olmalı.
 *   - `expiryDate <= now + daysAhead` ise uyarı oluşur.
 *   - Şiddet: `expired` (<= 0 gün), `critical` (1..7 gün),
 *     `warning` (8..daysAhead gün).
 * - **refresh**: uyarıları yeniden hesaplar; ack'lar korunur
 *   (default) veya `resetAcknowledgements=true` ile sıfırlanır.
 *   Sonuç: hesaplanan uyarı sayıları + zaman.
 * - **acknowledgeLowStock** / **acknowledgeExpiringLot**:
 *   - Uyarı bulunamazsa 404 VET-STOCK_ALERT-0001.
 *   - Status = "resolved" ise 422 VET-STOCK_ALERT-0003.
 *   - Status = "active" → "acknowledged" (audit
 *     `audit:stock_alert.acknowledge`, info).
 *   - Status = "acknowledged" → idempotent (no-op).
 * - **summary**: dashboard kartı için hızlı sayım.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Uyarılar üzerinde fiziksel
 *   silme YOKTUR; ack'lar soft delete mantığıyla korunur.
 *
 * @since GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  computeExpirySeverity,
  computeLowStockSeverity,
  daysUntilExpiry,
  decimalLessOrEqual,
  expiringLotAlertId,
  lowStockAlertId,
  stockAlertAckKey,
  toExpiringLotAlert,
  toLowStockAlert,
  type ExpiringLotAlertRecord,
  type LowStockAlertRecord,
} from "../../common/stock-alerts/stock-alert.types.js";
import type {
  ExpiringLotAlert,
  ExpiringLotAlertFilters,
  ExpiringLotAlertListResponse,
  ExpiringLotAlertStatus,
  LowStockAlert,
  LowStockAlertFilters,
  LowStockAlertListResponse,
  LowStockAlertStatus,
  StockAlertRefreshInput,
  StockAlertRefreshResponse,
  StockAlertSummary,
} from "@vetniva/contracts";

import { InventoryService } from "../inventory/inventory.service.js";
import { ProductsService } from "../products/products.service.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";

import { StockAlertAcksRepository } from "./stock-alert-acks.repository.js";

@Injectable()
export class StockAlertsService {
  private readonly logger = new Logger(StockAlertsService.name);

  public constructor(
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly stockMovements: StockMovementsService,
    private readonly acks: StockAlertAcksRepository,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // listLowStock
  // =========================================================================

  /**
   * Tenant-scoped düşük stok uyarıları. Severity ve status
   * filtreleri uygulanır. `activeOnly=true` ise yalnızca
   * `status='active'` olanlar döner (acknowledged/resolved hariç).
   */
  public async listLowStock(
    tenantId: string,
    filters: LowStockAlertFilters,
    actor: ActorContext,
  ): Promise<LowStockAlertListResponse> {
    this.requireTenantScope(actor, tenantId);
    const computed = await this.computeLowStock(tenantId);
    return this.applyLowStockFilters(computed, filters);
  }

  // =========================================================================
  // listExpiringLots
  // =========================================================================

  /**
   * Tenant-scoped SKT uyarıları. `daysAhead` default 30; yalnızca
   * `expiryDate <= now + daysAhead` olan lotlar dahil edilir.
   * `severity`/`status`/`productId`/`activeOnly` filtreleri
   * uygulanır.
   */
  public async listExpiringLots(
    tenantId: string,
    filters: ExpiringLotAlertFilters,
    actor: ActorContext,
  ): Promise<ExpiringLotAlertListResponse> {
    this.requireTenantScope(actor, tenantId);
    const computed = await this.computeExpiringLots(tenantId, filters.daysAhead);
    return this.applyExpiringLotFilters(computed, filters);
  }

  // =========================================================================
  // refresh
  // =========================================================================

  /**
   * Uyarıları yeniden hesaplar; ack'lar korunur (default) veya
   * `resetAcknowledgements=true` ile sıfırlanır. Sonuç:
   * hesaplanan uyarı sayıları + zaman damgası.
   *
   * Audit `audit:stock_alert.refresh` (info) yayınlanır; bu
   * yenilemenin zamanı ve sayıları metadata'ya yazılır.
   */
  public async refresh(
    tenantId: string,
    input: StockAlertRefreshInput | undefined,
    actor: ActorContext,
  ): Promise<StockAlertRefreshResponse> {
    this.requireTenantScope(actor, tenantId);

    if (input?.resetAcknowledgements === true) {
      this.acks.clearForTenant(tenantId);
    }

    const lowStock = await this.computeLowStock(tenantId);
    const expiring = await this.computeExpiringLots(tenantId, 30);

    const computedAt = new Date().toISOString();
    const response: StockAlertRefreshResponse = {
      computedAt,
      lowStockAlertCount: lowStock.filter((r) => r.status === "active").length,
      expiringLotAlertCount: expiring.filter((r) => r.status === "active").length,
      criticalLowStockCount: lowStock.filter(
        (r) => r.severity === "critical" && r.status === "active",
      ).length,
      expiredLotCount: expiring.filter(
        (r) => r.severity === "expired" && r.status === "active",
      ).length,
    };

    await this.audit.recordSimple(
      "audit:stock_alert.refresh",
      "stock_alert",
      tenantId,
      "refresh",
      this.actorToAuditActor(actor),
      "info",
      {
        resetAcknowledgements: input?.resetAcknowledgements ?? false,
        lowStockAlertCount: response.lowStockAlertCount,
        expiringLotAlertCount: response.expiringLotAlertCount,
        criticalLowStockCount: response.criticalLowStockCount,
        expiredLotCount: response.expiredLotCount,
      },
    );

    return response;
  }

  // =========================================================================
  // acknowledgeLowStock
  // =========================================================================

  /**
   * Düşük stok uyarısını görüldü işaretle. Idempotent.
   */
  public async acknowledgeLowStock(
    tenantId: string,
    productId: string,
    note: string | undefined,
    actor: ActorContext,
  ): Promise<LowStockAlert> {
    this.requireTenantScope(actor, tenantId);
    const computed = await this.computeLowStock(tenantId);
    const rec = computed.find((r) => r.productId === productId);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-STOCK_ALERT-0001",
        message: "Düşük stok uyarısı bulunamadı",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-STOCK_ALERT-0001",
        details: { productId },
      });
    }
    if (rec.status === "resolved") {
      throw new DomainError({
        errorCode: "VET-STOCK_ALERT-0003",
        message: "Çözülmüş uyarı acknowledge edilemez",
        httpStatus: 422,
        severity: "info",
        i18nKey: "error.VET-STOCK_ALERT-0003",
        details: { productId, status: rec.status },
      });
    }

    // Idempotent: mevcut ack varsa orijinal acknowledgedAt
    // korunur; yoksa yeni timestamp üretilir.
    const existingAck = this.acks.find(tenantId, "lowStock", productId);
    const acknowledgedAt =
      existingAck?.acknowledgedAt ?? new Date().toISOString();
    this.acks.upsert({
      tenantId,
      alertKey: stockAlertAckKey("lowStock", productId),
      alertType: "lowStock",
      targetId: productId,
      acknowledgedAt,
      acknowledgedBy: actor.actorId ?? "system",
      note: note ?? null,
    });

    const updated: LowStockAlertRecord = {
      ...rec,
      status: "acknowledged",
      acknowledgedAt,
      acknowledgedBy: actor.actorId ?? "system",
    };
    await this.audit.recordSimple(
      "audit:stock_alert.acknowledge",
      "low_stock_alert",
      productId,
      "acknowledge",
      this.actorToAuditActor(actor),
      "info",
      {
        alertType: "lowStock",
        productId,
        severity: rec.severity,
        currentQuantity: rec.currentQuantity,
        threshold: rec.threshold,
        note: note ?? null,
      },
    );
    return toLowStockAlert(updated);
  }

  // =========================================================================
  // acknowledgeExpiringLot
  // =========================================================================

  /**
   * SKT uyarısını görüldü işaretle. Idempotent.
   */
  public async acknowledgeExpiringLot(
    tenantId: string,
    lotId: string,
    note: string | undefined,
    actor: ActorContext,
  ): Promise<ExpiringLotAlert> {
    this.requireTenantScope(actor, tenantId);
    // listExpiringLots default daysAhead ile aynı pencereyi (30
    // gün) kullan; uyarı 30 gün penceresinin dışındaysa ack
    // edilemez.
    const computed = await this.computeExpiringLots(tenantId, 30);
    const rec = computed.find((r) => r.lotId === lotId);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-STOCK_ALERT-0001",
        message: "SKT uyarısı bulunamadı",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-STOCK_ALERT-0001",
        details: { lotId },
      });
    }
    if (rec.status === "resolved") {
      throw new DomainError({
        errorCode: "VET-STOCK_ALERT-0003",
        message: "Çözülmüş uyarı acknowledge edilemez",
        httpStatus: 422,
        severity: "info",
        i18nKey: "error.VET-STOCK_ALERT-0003",
        details: { lotId, status: rec.status },
      });
    }

    // Idempotent: mevcut ack varsa orijinal acknowledgedAt
    // korunur; yoksa yeni timestamp üretilir.
    const existingAck = this.acks.find(tenantId, "expiring", lotId);
    const acknowledgedAt =
      existingAck?.acknowledgedAt ?? new Date().toISOString();
    this.acks.upsert({
      tenantId,
      alertKey: stockAlertAckKey("expiring", lotId),
      alertType: "expiring",
      targetId: lotId,
      acknowledgedAt,
      acknowledgedBy: actor.actorId ?? "system",
      note: note ?? null,
    });

    const updated: ExpiringLotAlertRecord = {
      ...rec,
      status: "acknowledged",
      acknowledgedAt,
      acknowledgedBy: actor.actorId ?? "system",
    };
    await this.audit.recordSimple(
      "audit:stock_alert.acknowledge",
      "expiring_lot_alert",
      lotId,
      "acknowledge",
      this.actorToAuditActor(actor),
      "info",
      {
        alertType: "expiring",
        lotId,
        productId: rec.productId,
        severity: rec.severity,
        daysUntilExpiry: rec.daysUntilExpiry,
        expiryDate: rec.expiryDate,
        note: note ?? null,
      },
    );
    return toExpiringLotAlert(updated);
  }

  // =========================================================================
  // summary (dashboard için hızlı bakış)
  // =========================================================================

  /**
   * Dashboard özet kartı için hızlı bakış. computeLowStock +
   * computeExpiringLots çağrısı yapıp status/severity sayılarını
   * döner. Filtresiz.
   */
  public async summary(
    tenantId: string,
    actor: ActorContext,
  ): Promise<StockAlertSummary> {
    this.requireTenantScope(actor, tenantId);
    const low = await this.computeLowStock(tenantId);
    const exp = await this.computeExpiringLots(tenantId, 30);
    return {
      computedAt: new Date().toISOString(),
      lowStockAlertCount: low.filter((r) => r.status === "active").length,
      criticalLowStockCount: low.filter(
        (r) => r.severity === "critical" && r.status === "active",
      ).length,
      expiringLotAlertCount: exp.filter((r) => r.status === "active").length,
      criticalLotCount: exp.filter(
        (r) => r.severity === "critical" && r.status === "active",
      ).length,
      expiredLotCount: exp.filter(
        (r) => r.severity === "expired" && r.status === "active",
      ).length,
      acknowledgedLowStockCount: low.filter(
        (r) => r.status === "acknowledged",
      ).length,
      acknowledgedLotCount: exp.filter((r) => r.status === "acknowledged")
        .length,
    };
  }

  // =========================================================================
  // Private: computeLowStock
  // =========================================================================

  /**
   * Tenant-scoped tüm aktif (arşivsiz, purchaseTracked=true,
   * lowStockThreshold !== null) ürünler için uyarı hesapla. Sonuç
   * transient'tır; status'ler ack repository'sinden alınır.
   */
  private async computeLowStock(tenantId: string): Promise<LowStockAlertRecord[]> {
    const listResult = await this.products.listProducts(
      tenantId,
      { active: true, limit: 200, offset: 0 },
      { actorId: null, actorType: "system", tenantId, isSuperadmin: true } as ActorContext,
    );
    // listProducts zaten yukarıda requireTenantScope yapıyor;
    // superadmin shortcut ile tenant kapsamı korunur.
    const nowIso = new Date().toISOString();
    const balances = this.stockMovements.listBalances(
      tenantId,
      { actorId: null, actorType: "system", tenantId, isSuperadmin: true } as ActorContext,
    );
    const balanceByProduct = new Map<string, string>();
    for (const b of balances.items) {
      balanceByProduct.set(b.productId, b.netQuantity);
    }

    const out: LowStockAlertRecord[] = [];
    for (const p of listResult.items) {
      if (p.archivedAt !== null) continue;
      if (!p.purchaseTracked) continue;
      if (p.lowStockThreshold === null) continue;
      const currentQuantity = balanceByProduct.get(p.id) ?? "0";
      if (!decimalLessOrEqual(currentQuantity, p.lowStockThreshold)) {
        continue;
      }
      const severity = computeLowStockSeverity(currentQuantity);
      const acked = this.acks.find(tenantId, "lowStock", p.id);
      let status: LowStockAlertStatus = "active";
      if (acked) status = "acknowledged";
      out.push({
        id: lowStockAlertId(tenantId, p.id),
        tenantId,
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        productKind: p.kind,
        unit: p.unit,
        currentQuantity,
        threshold: p.lowStockThreshold,
        severity,
        status,
        acknowledgedAt: acked?.acknowledgedAt ?? null,
        acknowledgedBy: acked?.acknowledgedBy ?? null,
        computedAt: nowIso,
      });
    }
    // Şiddete göre azalan (critical > warning), sonra eşik aşımı
    // yüzdesi.
    out.sort((a, b) => {
      const w = severityWeight(b.severity) - severityWeight(a.severity);
      if (w !== 0) return w;
      return a.productName.localeCompare(b.productName, "tr");
    });
    return out;
  }

  // =========================================================================
  // Private: computeExpiringLots
  // =========================================================================

  /**
   * Tenant-scoped tüm aktif (arşivsiz) lotlar için SKT uyarısı
   * hesapla. Lot ürünü de arşivsiz olmalı. `daysAhead` üst sınır;
   * default 30.
   */
  private async computeExpiringLots(
    tenantId: string,
    daysAhead: number,
  ): Promise<ExpiringLotAlertRecord[]> {
    const lotsResult = await this.inventory.listLots(
      tenantId,
      { active: true, limit: 200, offset: 0 },
      { actorId: null, actorType: "system", tenantId, isSuperadmin: true } as ActorContext,
    );
    // listLots zaten tenant kapsamı koruyor.
    const nowIso = new Date().toISOString();
    const balances = this.stockMovements.listBalances(
      tenantId,
      { actorId: null, actorType: "system", tenantId, isSuperadmin: true } as ActorContext,
    );
    const balanceByLot = new Map<string, string>();
    for (const b of balances.items) {
      if (b.lotId !== null) {
        balanceByLot.set(b.lotId, b.netQuantity);
      }
    }
    // Ürün bilgisi (arşiv kontrolü için).
    const products = await this.products.listProducts(
      tenantId,
      { active: true, limit: 200, offset: 0 },
      { actorId: null, actorType: "system", tenantId, isSuperadmin: true } as ActorContext,
    );
    const productById = new Map<string, (typeof products.items)[number]>();
    for (const p of products.items) {
      productById.set(p.id, p);
    }

    const out: ExpiringLotAlertRecord[] = [];
    for (const lot of lotsResult.items) {
      if (lot.archivedAt !== null) continue;
      const product = productById.get(lot.productId);
      if (!product || product.archivedAt !== null) continue;
      const days = daysUntilExpiry(lot.expiryDate);
      if (days > daysAhead) continue;
      const severity = computeExpirySeverity(days);
      const acked = this.acks.find(tenantId, "expiring", lot.id);
      let status: ExpiringLotAlertStatus = "active";
      if (acked) status = "acknowledged";
      const currentQuantity = balanceByLot.get(lot.id) ?? "0";
      out.push({
        id: expiringLotAlertId(tenantId, lot.id),
        tenantId,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        productId: lot.productId,
        productName: product.name,
        productSku: product.sku,
        expiryDate: lot.expiryDate,
        daysUntilExpiry: days,
        currentQuantity,
        severity,
        status,
        acknowledgedAt: acked?.acknowledgedAt ?? null,
        acknowledgedBy: acked?.acknowledgedBy ?? null,
        computedAt: nowIso,
      });
    }
    // SKT'ye en yakın olan üstte, sonra lot numarası.
    out.sort((a, b) => {
      if (a.daysUntilExpiry !== b.daysUntilExpiry) {
        return a.daysUntilExpiry - b.daysUntilExpiry;
      }
      return a.lotNumber.localeCompare(b.lotNumber, "tr");
    });
    return out;
  }

  // =========================================================================
  // Private: filters
  // =========================================================================

  private applyLowStockFilters(
    items: LowStockAlertRecord[],
    filters: LowStockAlertFilters,
  ): LowStockAlertListResponse {
    const filtered = items.filter((r) => {
      if (filters.severity && r.severity !== filters.severity) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.productId && r.productId !== filters.productId) return false;
      if (filters.activeOnly && r.status !== "active") return false;
      return true;
    });
    const total = filtered.length;
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    return {
      items: filtered.slice(offset, offset + limit).map((r) => toLowStockAlert(r)),
      total,
    };
  }

  private applyExpiringLotFilters(
    items: ExpiringLotAlertRecord[],
    filters: ExpiringLotAlertFilters,
  ): ExpiringLotAlertListResponse {
    const filtered = items.filter((r) => {
      if (filters.severity && r.severity !== filters.severity) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.lotId && r.lotId !== filters.lotId) return false;
      if (filters.productId && r.productId !== filters.productId) return false;
      if (filters.activeOnly && r.status !== "active") return false;
      return true;
    });
    const total = filtered.length;
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    return {
      items: filtered.slice(offset, offset + limit).map((r) =>
        toExpiringLotAlert(r),
      ),
      total,
    };
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
      actorType: actor.actorType as "user" | "system",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}

function severityWeight(s: "warning" | "critical" | "expired"): number {
  if (s === "expired") return 3;
  if (s === "critical") return 2;
  return 1;
}
