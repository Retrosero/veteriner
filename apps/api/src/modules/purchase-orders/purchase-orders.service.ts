/**
 * @file PurchaseOrder (satın alma siparişi) service.
 * @module apps/api/modules/purchase-orders/purchase-orders.service
 *
 * @description GOAL-062 (FAZ-6) satın alma siparişi iş kuralları.
 *
 * İş kuralları:
 * - `createPurchaseOrder`:
 *   - Tedarikçi aktif ve arşivsiz olmalı (422 VET-PURCHASE_ORDER-0005).
 *   - En az 1 satır; her satırda productId/unit/orderedQuantity/unitPrice
 *     zorunlu. Cross-module: SupplierService.findById ile supplier
 *     varlık + arşiv kontrolü.
 *   - `totalAmount` satır toplamlarından türetilir.
 *   - Audit `audit:purchase_order.create` (info).
 * - `listPurchaseOrders`: tenant-scoped; status/supplierId/branchId
 *   /search/sort/limit/offset filtreleri.
 * - `getPurchaseOrderDetail`: header + lines; cross-tenant → null.
 * - `updatePurchaseOrder`: yalnızca `draft` durumda; onaylı/alınmış
 *   siparişler düzenlenemez (409 VET-PURCHASE_ORDER-0004).
 * - `approvePurchaseOrder`: `draft → approved`. Audit.
 * - `receivePurchaseOrder`: `approved/partial → partial | received`.
 *   Satır başına `receivedQuantity` (toplam kabul ≤ orderedQuantity)
 *   + `unitCost` (gerçek alış maliyeti) alınır. Tüm satırlar tam
 *   karşılandıysa `received`, aksi `partial` olur. Audit
 *   `audit:purchase_order.receive` (info).
 * - `cancelPurchaseOrder`: `draft/approved → cancelled` (mal kabul
 *   yapılmamışsa). `partial/received` iptal edilemez
 *   (409 VET-PURCHASE_ORDER-0008). Audit.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Satın alma siparişi üzerinde fiziksel silme YOKTUR.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { Injectable, Logger } from "@nestjs/common";

import { PurchaseOrdersRepository } from "./purchase-orders.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  addDecimalString,
  compareDecimalString,
  multiplyDecimalString,
  toPurchaseOrder,
  toPurchaseOrderLine,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
} from "../../common/purchase-orders/purchase-order.types.js";
import { SuppliersService } from "../suppliers/suppliers.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  PurchaseOrderCreateInput,
  PurchaseOrderCancelInput,
  PurchaseOrderDetail,
  PurchaseOrderFilters,
  PurchaseOrderLineInput,
  PurchaseOrderListResponse,
  PurchaseOrderReceiveInput,
  PurchaseOrderUpdateInput,
} from "@vetniva/contracts";

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  public constructor(
    private readonly repo: PurchaseOrdersRepository,
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createPurchaseOrder (taslak)
  // -------------------------------------------------------------------------

  public async createPurchaseOrder(
    tenantId: string,
    input: PurchaseOrderCreateInput,
    actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    this.requireTenantScope(actor, tenantId);

    // 1) Tedarikçi varlık + aktif/arşivsiz kontrolü.
    const supplier = await this.suppliers.getSupplier(
      tenantId,
      input.supplierId,
      actor,
    );
    if (!supplier) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0005",
        message: "Tedarikçi bulunamadı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PURCHASE_ORDER-0005",
        details: { supplierId: input.supplierId },
      });
    }
    if (supplier.archivedAt !== null || supplier.active === false) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0005",
        message: "Arşivlenmiş tedarikçi için sipariş oluşturulamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PURCHASE_ORDER-0005",
        details: { supplierId: input.supplierId },
      });
    }

    // 2) Header'ı önce insert et; linesByOrder boş array ile
    //    başlatılır, sonra satır eklemeleri bu listeye eklenir.
    const lineInputs: PurchaseOrderLineInput[] = input.lines;
    const nowIso = new Date().toISOString();
    const orderId = this.repo.nextId(tenantId);
    const header: PurchaseOrderRecord = {
      id: orderId,
      tenantId,
      supplierId: input.supplierId,
      branchId: input.branchId ?? null,
      status: "draft",
      currency: input.currency,
      expectedAt: input.expectedAt ?? null,
      totalAmount: "0",
      notes: input.notes ?? null,
      approvedAt: null,
      approvedBy: null,
      receivedAt: null,
      receivedBy: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insert(header);

    // 3) Satır toplamlarını hesapla + satırları ekle.
    const lineRecords: PurchaseOrderLineRecord[] = [];
    let totalAmount = "0";

    for (const line of lineInputs) {
      const lineTotal = multiplyDecimalString(
        line.orderedQuantity,
        line.unitPrice,
      );
      if (lineTotal === null) {
        throw new DomainError({
          errorCode: "VET-PURCHASE_ORDER-0007",
          message: "Sipariş satırı geçersiz (miktar × fiyat hesaplanamadı)",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-PURCHASE_ORDER-0007",
          details: {
            productId: line.productId,
            orderedQuantity: line.orderedQuantity,
            unitPrice: line.unitPrice,
          },
        });
      }
      const lineId = this.repo.nextLineId(tenantId);
      const lineRec: PurchaseOrderLineRecord = {
        id: lineId,
        tenantId,
        purchaseOrderId: orderId,
        productId: line.productId,
        unit: line.unit,
        orderedQuantity: line.orderedQuantity,
        unitPrice: line.unitPrice,
        lineTotal,
        receivedQuantity: "0",
        unitCost: null,
        notes: line.notes ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.repo.insertLine(lineRec);
      lineRecords.push(lineRec);
      const sum = addDecimalString(totalAmount, lineTotal);
      if (sum === null) {
        throw new DomainError({
          errorCode: "VET-PURCHASE_ORDER-0007",
          message: "Sipariş toplamı hesaplanamadı",
          httpStatus: 422,
        });
      }
      totalAmount = sum;
    }

    // 4) Total amount'u header'a yaz.
    this.repo.update(tenantId, orderId, { totalAmount, updatedAt: nowIso });
    const persistedHeader = this.repo.findById(tenantId, orderId);
    if (!persistedHeader) throw new Error("Purchase order oluşturulamadı");
    await this.repo.persistOrderWithLines(persistedHeader, lineRecords);

    // 5) Audit.
    await this.audit.recordSimple(
      "audit:purchase_order.create",
      "purchase_order",
      orderId,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        supplierId: header.supplierId,
        branchId: header.branchId,
        currency: header.currency,
        expectedAt: header.expectedAt,
        lineCount: lineRecords.length,
        totalAmount,
      },
    );

    const finalHeader = this.repo.findById(tenantId, orderId);
    if (!finalHeader) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      order: toPurchaseOrder(finalHeader),
      lines: lineRecords.map((l) => toPurchaseOrderLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // listPurchaseOrders
  // -------------------------------------------------------------------------

  public async listPurchaseOrders(
    tenantId: string,
    filters: PurchaseOrderFilters,
    actor: ActorContext,
  ): Promise<PurchaseOrderListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearch(tenantId, {
      status: filters.status,
      supplierId: filters.supplierId,
      branchId: filters.branchId,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toPurchaseOrder(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getPurchaseOrderDetail
  // -------------------------------------------------------------------------

  public async getPurchaseOrderDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<PurchaseOrderDetail | null> {
    this.requireTenantScope(actor, tenantId);
    const header = await this.repo.persistedById(tenantId, id);
    if (!header) return null;
    const lines = await this.repo.persistedLines(tenantId, id);
    return {
      order: toPurchaseOrder(header),
      lines: lines.map((l) => toPurchaseOrderLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // updatePurchaseOrder (yalnızca draft)
  // -------------------------------------------------------------------------

  public async updatePurchaseOrder(
    tenantId: string,
    id: string,
    input: PurchaseOrderUpdateInput,
    actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PURCHASE_ORDER-0001",
        details: { id },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0004",
        message: "Yalnızca taslak siparişler düzenlenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PURCHASE_ORDER-0004",
        details: { id, currentStatus: existing.status },
      });
    }

    // Tedarikçi değişiyorsa yeni tedarikçi kontrolü.
    if (
      input.supplierId !== undefined &&
      input.supplierId !== existing.supplierId
    ) {
      const newSupplier = await this.suppliers.getSupplier(
        tenantId,
        input.supplierId,
        actor,
      );
      if (!newSupplier || newSupplier.archivedAt !== null) {
        throw new DomainError({
          errorCode: "VET-PURCHASE_ORDER-0005",
          message: "Tedarikçi uygun değil",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-PURCHASE_ORDER-0005",
          details: { supplierId: input.supplierId },
        });
      }
    }

    const nowIso = new Date().toISOString();
    let replacementLines: PurchaseOrderLineRecord[] | null = null;

    // Satırlar değişiyorsa mevcut satırları silip yeniden oluştur.
    if (input.lines !== undefined) {
      replacementLines = [];
      // Eski satırları temizle.
      const oldLines = await this.repo.persistedLines(tenantId, id);
      for (const old of oldLines) {
        // Repo'da deleteLine yok; service reset için yeni bir
        // helper yok. Burada basitçe listeleri sıfırlıyoruz:
        // map üzerinden referansları temizlemek için deleteLine
        // eklemek yerine update akışında tüm satırları yeniden
        // kuruyoruz. Not: ileride deleteLine eklenmeli.
        // Şimdilik her satırı update ile aynı id'ye yeniden
        // yazmak yerine satır listesini sıfırlama yaklaşımı
        // mümkün olmadığından "lines değişti" senaryosunda
        // eski satırların `receivedQuantity` 0 olmalı; yeni
        // satırları insert ediyoruz.
        // Eski satırları listeden çıkarmak için satır
        // patch'i ile updatedAt set edip aynen bırakıyoruz.
        // Bu tasarım kararı GOAL-063 stok hareketleri
        // bağlandığında değişecek (lot/SKT girişi sonrası
        // satır silinemez; ondan önce draft'ta satır silme
        // serbest).
        await this.repo.persistedUpdateLine(tenantId, old.id, {
          updatedAt: nowIso,
        });
      }
      // Yeni satırları ekle (id'ler yenidir).
      let totalAmount = "0";
      for (const line of input.lines) {
        const lineTotal = multiplyDecimalString(
          line.orderedQuantity,
          line.unitPrice,
        );
        if (lineTotal === null) {
          throw new DomainError({
            errorCode: "VET-PURCHASE_ORDER-0007",
            message: "Sipariş satırı geçersiz",
            httpStatus: 422,
          });
        }
        const lineId = this.repo.nextLineId(tenantId);
        const lineRec: PurchaseOrderLineRecord = {
          id: lineId,
          tenantId,
          purchaseOrderId: id,
          productId: line.productId,
          unit: line.unit,
          orderedQuantity: line.orderedQuantity,
          unitPrice: line.unitPrice,
          lineTotal,
          receivedQuantity: "0",
          unitCost: null,
          notes: line.notes ?? null,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        this.repo.insertLine(lineRec);
        replacementLines.push(lineRec);
        const sum = addDecimalString(totalAmount, lineTotal);
        if (sum === null) {
          throw new DomainError({
            errorCode: "VET-PURCHASE_ORDER-0007",
            message: "Toplam hesaplanamadı",
            httpStatus: 422,
          });
        }
        totalAmount = sum;
      }
      await this.repo.persistedUpdate(tenantId, id, { totalAmount, updatedAt: nowIso });
      await this.repo.persistedReplaceLines(tenantId, id, replacementLines);
    }

    // Header alanları.
    if (input.supplierId !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        supplierId: input.supplierId,
        updatedAt: nowIso,
      });
    }
    if (input.branchId !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        branchId: input.branchId,
        updatedAt: nowIso,
      });
    }
    if (input.currency !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        currency: input.currency,
        updatedAt: nowIso,
      });
    }
    if (input.expectedAt !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        expectedAt: input.expectedAt,
        updatedAt: nowIso,
      });
    }
    if (input.notes !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        notes: input.notes,
        updatedAt: nowIso,
      });
    }

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
      });
    }
    await this.audit.recordSimple(
      "audit:purchase_order.update",
      "purchase_order",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        linesChanged: input.lines !== undefined,
        fieldsChanged: Object.keys(input).filter((k) => k !== "lines"),
      },
    );

    return {
      order: toPurchaseOrder(updated),
      lines: (await this.repo.persistedLines(tenantId, id)).map((l) =>
        toPurchaseOrderLine(l),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // approvePurchaseOrder
  // -------------------------------------------------------------------------

  public async approvePurchaseOrder(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0002",
        message: "Yalnızca taslak sipariş onaylanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PURCHASE_ORDER-0002",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdate(tenantId, id, {
      status: "approved",
      approvedAt: nowIso,
      approvedBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:purchase_order.approve",
      "purchase_order",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        supplierId: existing.supplierId,
        totalAmount: existing.totalAmount,
      },
    );

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      order: toPurchaseOrder(updated),
      lines: (await this.repo.persistedLines(tenantId, id)).map((l) =>
        toPurchaseOrderLine(l),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // receivePurchaseOrder (mal kabul)
  // -------------------------------------------------------------------------

  public async receivePurchaseOrder(
    tenantId: string,
    id: string,
    input: PurchaseOrderReceiveInput,
    actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status !== "approved" && existing.status !== "partial") {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0002",
        message: "Yalnızca onaylı/kısmi siparişler kabul edilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PURCHASE_ORDER-0002",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    const lines = await this.repo.persistedLines(tenantId, id);
    const lineById = new Map<string, PurchaseOrderLineRecord>();
    for (const l of lines) lineById.set(l.id, l);

    let allFullyReceived = true;

    for (const recv of input.lines) {
      const line = lineById.get(recv.lineId);
      if (!line) {
        throw new DomainError({
          errorCode: "VET-PURCHASE_ORDER-0007",
          message: "Satıra karşılık gelen kayıt bulunamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-PURCHASE_ORDER-0007",
          details: { lineId: recv.lineId },
        });
      }
      // Yeni kabul miktarı = mevcut kabul + bu kabul.
      const newReceived = addDecimalString(
        line.receivedQuantity,
        recv.receivedQuantity,
      );
      if (newReceived === null) {
        throw new DomainError({
          errorCode: "VET-PURCHASE_ORDER-0007",
          message: "Geçersiz miktar formatı",
          httpStatus: 422,
        });
      }
      // Toplam kabul orderedQuantity'yi aşamaz.
      const cmp = compareDecimalString(newReceived, line.orderedQuantity);
      if (cmp === null) {
        throw new DomainError({
          errorCode: "VET-PURCHASE_ORDER-0007",
          message: "Geçersiz miktar karşılaştırması",
          httpStatus: 422,
        });
      }
      if (cmp > 0) {
        throw new DomainError({
          errorCode: "VET-PURCHASE_ORDER-0007",
          message: "Kabul miktarı sipariş miktarını aşamaz",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-PURCHASE_ORDER-0007",
          details: {
            lineId: recv.lineId,
            orderedQuantity: line.orderedQuantity,
            newReceived,
          },
        });
      }

      await this.repo.persistedUpdateLine(tenantId, line.id, {
        receivedQuantity: newReceived,
        unitCost: recv.unitCost,
        notes: recv.notes ?? line.notes,
        updatedAt: nowIso,
      });

      if (cmp < 0) allFullyReceived = false;
    }

    // Tüm satırları kontrol et (yalnızca input'ta olmayanlar da
    // dahil); herhangi biri hâlâ eksikse `partial` olur.
    const finalLines = await this.repo.persistedLines(tenantId, id);
    for (const l of finalLines) {
      const c = compareDecimalString(l.receivedQuantity, l.orderedQuantity);
      if (c === null || c < 0) {
        allFullyReceived = false;
        break;
      }
    }

    const newStatus = allFullyReceived ? "received" : "partial";
    await this.repo.persistedUpdate(tenantId, id, {
      status: newStatus,
      receivedAt: nowIso,
      receivedBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:purchase_order.receive",
      "purchase_order",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        lineCount: input.lines.length,
        newStatus,
      },
    );

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      order: toPurchaseOrder(updated),
      lines: finalLines.map((l) => toPurchaseOrderLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // cancelPurchaseOrder
  // -------------------------------------------------------------------------

  public async cancelPurchaseOrder(
    tenantId: string,
    id: string,
    input: PurchaseOrderCancelInput,
    actor: ActorContext,
  ): Promise<PurchaseOrderDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
      });
    }
    if (
      existing.status === "cancelled" ||
      existing.status === "received" ||
      existing.status === "partial"
    ) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0008",
        message: "Bu durumdaki sipariş iptal edilemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PURCHASE_ORDER-0008",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    await this.repo.persistedUpdate(tenantId, id, {
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: actor.actorId ?? "system",
      cancelReason: input.reason,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:purchase_order.cancel",
      "purchase_order",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        previousStatus: existing.status,
        reason: input.reason,
      },
    );

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PURCHASE_ORDER-0001",
        message: "Satın alma siparişi bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      order: toPurchaseOrder(updated),
      lines: (await this.repo.persistedLines(tenantId, id)).map((l) =>
        toPurchaseOrderLine(l),
      ),
    };
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
