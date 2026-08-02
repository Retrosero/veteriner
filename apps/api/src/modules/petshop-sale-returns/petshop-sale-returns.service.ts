/**
 * @file PetshopSaleReturn (sale return) service.
 * @module apps/api/modules/petshop-sale-returns/petshop-sale-returns.service
 *
 * @description GOAL-065 (FAZ-6) petshop satış iadesi iş kuralları.
 *
 * İş kuralları:
 * - `createReturn` (taslak): yalnızca `completed` orijinal
 *   satışlara izin (422 VET-RETURN-0002). İade satırları
 *   orijinal satışın satırlarına `originalLineId` ile
 *   eşleşmeli (422 VET-RETURN-0004) ve miktar orijinal
 *   satılan miktardan (daha önce iade edilen dahil) fazla
 *   olmamalı (422 VET-RETURN-0003). Lot belirtilen satırlarda
 *   lot mevcut, aktif ve arşivsiz olmalı (404 VET-RETURN-0006,
 *   409 VET-RETURN-0007). Audit `audit:petshop_sale_return.create`.
 * - `listReturns`: tenant-scoped; status/originalSaleId/
 *   customerOwnerId/customerPatientId/refundMethod/sort
 *   filtreleri.
 * - `getReturnDetail`: header + lines; cross-tenant → null.
 * - `completeReturn`: draft → completed. Her satır için
 *   `StockMovementsService.createSystemMovement` ile
 *   `type=return`, `quantity = +N` çağrılır (ürün
 *   `purchaseTracked` ise). Tamamlanmış iadelerde stok
 *   hareketi oluşmaz. Audit `audit:petshop_sale_return.complete`.
 * - `cancelReturn`: draft → cancelled. Henüz `completed`
 *   olmamış iadeler iptal edilebilir; `completed` iadeler
 *   iptal edilemez (409 VET-RETURN-0005 → bu durumda
 *   ayrı bir "ters kayıt" iade ile yapılır; GOAL-073+ kapsamı).
 *   Audit `audit:petshop_sale_return.cancel`.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   İade üzerinde fiziksel silme YOKTUR.
 *
 * @since GOAL-065 (FAZ-6) petshop satış iadesi core
 */

import { Injectable, Logger } from "@nestjs/common";

import { PetshopSaleReturnsRepository } from "./petshop-sale-returns.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  addDecimalString,
  multiplyDecimalString,
  toPetshopSaleReturn,
  toPetshopSaleReturnLine,
  type PetshopSaleReturnLineRecord,
  type PetshopSaleReturnRecord,
} from "../../common/petshop-sale-returns/petshop-sale-return.types.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { PetshopSalesRepository } from "../petshop-sales/petshop-sales.repository.js";
import { ProductsService } from "../products/products.service.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { PetshopSaleLineRecord } from "../../common/petshop-sales/petshop-sale.types.js";
import type {
  PetshopSaleReturnCancelInput,
  PetshopSaleReturnCompleteInput,
  PetshopSaleReturnCreateInput,
  PetshopSaleReturnDetail,
  PetshopSaleReturnFilters,
  PetshopSaleReturnLineInput,
  PetshopSaleReturnListResponse,
} from "@vetniva/contracts";

@Injectable()
export class PetshopSaleReturnsService {
  private readonly logger = new Logger(PetshopSaleReturnsService.name);

  public constructor(
    private readonly repo: PetshopSaleReturnsRepository,
    private readonly salesRepo: PetshopSalesRepository,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly stockMovements: StockMovementsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createReturn (taslak)
  // -------------------------------------------------------------------------

  public async createReturn(
    tenantId: string,
    input: PetshopSaleReturnCreateInput,
    actor: ActorContext,
  ): Promise<PetshopSaleReturnDetail> {
    this.requireTenantScope(actor, tenantId);

    // 1) Orijinal satış var mı ve completed mı?
    const originalSale = await this.salesRepo.persistedById(
      tenantId,
      input.originalSaleId,
    );
    if (!originalSale) {
      throw new DomainError({
        errorCode: "VET-RETURN-0001",
        message: "Orijinal satış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0001",
        details: { originalSaleId: input.originalSaleId },
      });
    }
    if (originalSale.status !== "completed") {
      throw new DomainError({
        errorCode: "VET-RETURN-0002",
        message: "Yalnızca tamamlanmış satışlar iade edilebilir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0002",
        details: {
          originalSaleId: input.originalSaleId,
          currentStatus: originalSale.status,
        },
      });
    }

    // 2) İade edilebilecek miktarları hesapla (orijinal - daha önce
    //    iade edilen).
    const originalLines = await this.salesRepo.persistedLines(
      tenantId,
      originalSale.id,
    );
    const originalById = new Map<string, PetshopSaleLineRecord>();
    for (const l of originalLines) originalById.set(l.id, l);

    const previousReturns = await this.repo.persistedByOriginalSale(
      tenantId,
      originalSale.id,
    );
    const alreadyReturned = new Map<string, string>(); // originalLineId → qty
    for (const ret of previousReturns) {
      if (ret.status === "cancelled") continue;
      const lines = await this.repo.persistedLines(tenantId, ret.id);
      for (const rl of lines) {
        const sum = addDecimalString(
          alreadyReturned.get(rl.originalLineId) ?? "0",
          rl.quantity,
        );
        if (sum) alreadyReturned.set(rl.originalLineId, sum);
      }
    }

    // 3) Her iade satırı doğrula + lot kontrolü.
    for (const line of input.lines) {
      const orig = originalById.get(line.originalLineId);
      if (!orig) {
        throw new DomainError({
          errorCode: "VET-RETURN-0004",
          message: "İade satırı orijinal satışta bulunamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-RETURN-0004",
          details: {
            originalLineId: line.originalLineId,
            originalSaleId: originalSale.id,
          },
        });
      }
      if (orig.productId !== line.productId) {
        throw new DomainError({
          errorCode: "VET-RETURN-0004",
          message: "İade satırı ürünü orijinal satırdaki ürünle eşleşmiyor",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-RETURN-0004",
          details: {
            originalLineId: line.originalLineId,
            lineProductId: line.productId,
            originalProductId: orig.productId,
          },
        });
      }
      const already = alreadyReturned.get(line.originalLineId) ?? "0";
      const projected = addDecimalString(already, line.quantity);
      if (
        projected === null ||
        compareDecimalString(projected, orig.quantity) > 0
      ) {
        throw new DomainError({
          errorCode: "VET-RETURN-0003",
          message: "İade miktarı orijinal satış miktarını aşıyor",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-RETURN-0003",
          details: {
            originalLineId: line.originalLineId,
            originalQuantity: orig.quantity,
            alreadyReturned: already,
            requested: line.quantity,
          },
        });
      }
      // Lot kontrolü (purchaseTracked ise lot zorunlu; tüm
      // senaryolarda lot belirtilen satırlarda lot varlık +
      // arşiv kontrolü).
      if (line.lotId) {
        const lot = await this.inventory.getLot(tenantId, line.lotId, actor);
        if (!lot) {
          throw new DomainError({
            errorCode: "VET-RETURN-0006",
            message: "İade için belirtilen lot bulunamadı",
            httpStatus: 404,
            severity: "warning",
            i18nKey: "error.VET-RETURN-0006",
            details: { lotId: line.lotId },
          });
        }
        if (lot.archivedAt !== null) {
          throw new DomainError({
            errorCode: "VET-RETURN-0007",
            message: "İade için arşivli lot kullanılamaz",
            httpStatus: 409,
            severity: "warning",
            i18nKey: "error.VET-RETURN-0007",
            details: { lotId: line.lotId },
          });
        }
        if (lot.productId !== line.productId) {
          throw new DomainError({
            errorCode: "VET-RETURN-0008",
            message: "İade satırı lot'ı ürünle eşleşmiyor",
            httpStatus: 422,
            severity: "warning",
            i18nKey: "error.VET-RETURN-0008",
            details: {
              lotId: line.lotId,
              lotProductId: lot.productId,
              lineProductId: line.productId,
            },
          });
        }
      }
    }

    // 4) Header oluştur.
    const nowIso = new Date().toISOString();
    const returnId = this.repo.nextId(tenantId);
    const header: PetshopSaleReturnRecord = {
      id: returnId,
      tenantId,
      status: "draft",
      originalSaleId: input.originalSaleId,
      customerOwnerId: originalSale.customerOwnerId,
      customerPatientId: originalSale.customerPatientId,
      refundMethod: input.refundMethod,
      totalAmount: "0",
      globalDiscountPercent: input.globalDiscountPercent,
      refundAmount: "0",
      reason: input.reason,
      notes: input.notes ?? null,
      completedAt: null,
      completedBy: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insert(header);

    // 5) Satırları ekle + toplam hesapla.
    const lineRecords = this.buildAndInsertLines(
      tenantId,
      returnId,
      input.lines,
      nowIso,
    );
    const totalAmount = this.sumLineTotals(lineRecords);
    const refundAmount = this.applyGlobalDiscount(
      totalAmount,
      input.globalDiscountPercent,
    );

    this.repo.update(tenantId, returnId, {
      totalAmount,
      refundAmount,
      updatedAt: nowIso,
    });
    const persistedHeader = this.repo.findById(tenantId, returnId);
    if (!persistedHeader) throw new Error("Petshop iadesi oluşturulamadı");
    await this.repo.persistReturnWithLines(persistedHeader, lineRecords);

    // 6) Audit.
    await this.audit.recordSimple(
      "audit:petshop_sale_return.create",
      "petshop_sale_return",
      returnId,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        originalSaleId: input.originalSaleId,
        lineCount: lineRecords.length,
        totalAmount,
        refundAmount,
        refundMethod: header.refundMethod,
        reason: input.reason,
      },
    );

    const finalHeader = this.repo.findById(tenantId, returnId);
    if (!finalHeader) {
      throw new DomainError({
        errorCode: "VET-RETURN-0001",
        message: "İade bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0001",
      });
    }
    return {
      return: toPetshopSaleReturn(finalHeader),
      lines: lineRecords.map((l) => toPetshopSaleReturnLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // listReturns
  // -------------------------------------------------------------------------

  public async listReturns(
    tenantId: string,
    filters: PetshopSaleReturnFilters,
    actor: ActorContext,
  ): Promise<PetshopSaleReturnListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearch(tenantId, {
      status: filters.status,
      originalSaleId: filters.originalSaleId,
      customerOwnerId: filters.customerOwnerId,
      customerPatientId: filters.customerPatientId,
      refundMethod: filters.refundMethod,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toPetshopSaleReturn(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getReturnDetail
  // -------------------------------------------------------------------------

  public async getReturnDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<PetshopSaleReturnDetail | null> {
    this.requireTenantScope(actor, tenantId);
    const header = await this.repo.persistedById(tenantId, id);
    if (!header) return null;
    const lines = await this.repo.persistedLines(tenantId, id);
    return {
      return: toPetshopSaleReturn(header),
      lines: lines.map((l) => toPetshopSaleReturnLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // completeReturn (stok iade + tahsilat ters kayıt)
  // -------------------------------------------------------------------------

  public async completeReturn(
    tenantId: string,
    id: string,
    input: PetshopSaleReturnCompleteInput,
    actor: ActorContext,
  ): Promise<PetshopSaleReturnDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-RETURN-0001",
        message: "İade bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0001",
        details: { id },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-RETURN-0005",
        message: "Yalnızca taslak iadeler tamamlanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0005",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    const lines = await this.repo.persistedLines(tenantId, id);

    // Her satır için stok iade hareketi.
    for (const line of lines) {
      const product = await this.products.getProduct(
        tenantId,
        line.productId,
        actor,
      );
      if (!product) {
        throw new DomainError({
          errorCode: "VET-RETURN-0009",
          message: "İade satırı ürünü bulunamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-RETURN-0009",
          details: { productId: line.productId, lineId: line.id },
        });
      }
      if (product.purchaseTracked) {
        await this.stockMovements.createSystemMovement(
          tenantId,
          {
            type: "return",
            productId: line.productId,
            lotId: line.lotId ?? undefined,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            reason: `petshop_sale_return:${id}`,
            occurredAt: nowIso,
            notes: `petshop_sale_return:${id}`,
          },
          actor,
          {
            systemSourceType: "petshop_sale_return",
            systemSourceId: id,
          },
        );
      }
    }

    const refundMethod = input?.refundMethod ?? existing.refundMethod;
    if (input?.notes !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        notes: input.notes,
        updatedAt: nowIso,
      });
    }

    await this.repo.persistedUpdate(tenantId, id, {
      status: "completed",
      refundMethod,
      completedAt: nowIso,
      completedBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:petshop_sale_return.complete",
      "petshop_sale_return",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        originalSaleId: existing.originalSaleId,
        totalAmount: existing.totalAmount,
        refundAmount: existing.refundAmount,
        refundMethod,
        lineCount: lines.length,
      },
    );

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-RETURN-0001",
        message: "İade bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0001",
      });
    }
    return {
      return: toPetshopSaleReturn(updated),
      lines: this.repo
        .listLinesByReturn(tenantId, id)
        .map((l) => toPetshopSaleReturnLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // cancelReturn
  // -------------------------------------------------------------------------

  public async cancelReturn(
    tenantId: string,
    id: string,
    input: PetshopSaleReturnCancelInput,
    actor: ActorContext,
  ): Promise<PetshopSaleReturnDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-RETURN-0001",
        message: "İade bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0001",
        details: { id },
      });
    }
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-RETURN-0005",
        message: "İade zaten iptal edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0005",
        details: { id },
      });
    }
    if (existing.status === "completed") {
      throw new DomainError({
        errorCode: "VET-RETURN-0010",
        message: "Tamamlanmış iadeler iptal edilemez (ayrı ters kayıt açın)",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0010",
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
      "audit:petshop_sale_return.cancel",
      "petshop_sale_return",
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
        errorCode: "VET-RETURN-0001",
        message: "İade bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-RETURN-0001",
      });
    }
    return {
      return: toPetshopSaleReturn(updated),
      lines: this.repo
        .listLinesByReturn(tenantId, id)
        .map((l) => toPetshopSaleReturnLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildAndInsertLines(
    tenantId: string,
    returnId: string,
    inputs: PetshopSaleReturnLineInput[],
    nowIso: string,
  ): PetshopSaleReturnLineRecord[] {
    const records: PetshopSaleReturnLineRecord[] = [];
    for (const line of inputs) {
      // lineTotal = quantity * unitPrice * (1 - discountPercent/100)
      const gross = multiplyDecimalString(line.quantity, line.unitPrice);
      if (gross === null) {
        throw new DomainError({
          errorCode: "VET-RETURN-0011",
          message: "Satır tutarı hesaplanamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-RETURN-0011",
          details: {
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          },
        });
      }
      const factorNum = 100 - (line.discountPercent ?? 0);
      const discountedGross = multiplyDecimalString(
        gross,
        factorNum.toString(),
      );
      const lineTotal =
        discountedGross === null
          ? null
          : multiplyDecimalString(discountedGross, "0.01");
      if (lineTotal === null) {
        throw new DomainError({
          errorCode: "VET-RETURN-0011",
          message: "İndirim sonrası tutar hesaplanamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-RETURN-0011",
        });
      }
      const lineId = this.repo.nextLineId(tenantId);
      const rec: PetshopSaleReturnLineRecord = {
        id: lineId,
        tenantId,
        returnId,
        originalLineId: line.originalLineId,
        productId: line.productId,
        lotId: line.lotId ?? null,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent ?? 0,
        lineTotal,
        reason: line.reason ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.repo.insertLine(rec);
      records.push(rec);
    }
    return records;
  }

  private sumLineTotals(lines: PetshopSaleReturnLineRecord[]): string {
    let total = "0";
    for (const l of lines) {
      const sum = addDecimalString(total, l.lineTotal);
      if (sum === null) {
        throw new DomainError({
          errorCode: "VET-RETURN-0011",
          message: "Toplam hesaplanamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-RETURN-0011",
        });
      }
      total = sum;
    }
    return total;
  }

  private applyGlobalDiscount(
    totalAmount: string,
    globalDiscountPercent: number,
  ): string {
    if (globalDiscountPercent === 0) return totalAmount;
    const factorNum = 100 - globalDiscountPercent;
    const partial = multiplyDecimalString(totalAmount, factorNum.toString());
    if (partial === null) return totalAmount;
    return multiplyDecimalString(partial, "0.01") ?? totalAmount;
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

/* --------------------------------------------------------------------------
 * Yerel yardımcılar
 * -------------------------------------------------------------------------- */

/**
 * İki pozitif decimal string'i karşılaştır.
 * -1: a < b, 0: eşit, 1: a > b. Geçersiz girdi 0 döner.
 */
function compareDecimalString(a: string, b: string): -1 | 0 | 1 {
  if (!/^\d+(\.\d{1,4})?$/.test(a)) return 0;
  if (!/^\d+(\.\d{1,4})?$/.test(b)) return 0;
  const align = (v: string, scale: number): bigint => {
    const parts = v.split(".");
    const intPart = parts[0] ?? "0";
    const fracPart = (parts[1] ?? "").padEnd(scale, "0");
    return BigInt(intPart + fracPart);
  };
  const scaleA = (a.split(".")[1] ?? "").length;
  const scaleB = (b.split(".")[1] ?? "").length;
  const totalScale = Math.max(scaleA, scaleB);
  const A = align(a, totalScale);
  const B = align(b, totalScale);
  if (A < B) return -1;
  if (A > B) return 1;
  return 0;
}
