/**
 * @file PetshopSale (POS) service.
 * @module apps/api/modules/petshop-sales/petshop-sales.service
 *
 * @description GOAL-064 (FAZ-6) petshop POS iş kuralları.
 *
 * İş kuralları:
 * - `createSale` (taslak): satırlar eklenir; toplam + indirim
 *   hesaplanır. Ürün arşivsiz olmalı (422 VET-SALE-0006).
 *   Audit `audit:petshop_sale.create`.
 * - `listSales`: tenant-scoped; status/customerOwnerId/
 *   customerPatientId/paymentMethod/search/sort filtreleri.
 * - `getSaleDetail`: header + lines; cross-tenant → null.
 * - `updateSale`: yalnızca `draft` durumda; onaylanmış/alınmış
 *   satışlar düzenlenemez (409 VET-SALE-0003).
 * - `completeSale`: draft → completed. Her satır için
 *   `StockMovementsService.createSystemMovement` ile
 *   `type=sale`, `quantity = -N` çağrılır (stok düşümü). Ürün
 *   `purchaseTracked` değilse stok hareketi atlanır (servis/
 *   consumable için). Yetersiz stok varsa 422 VET-SALE-0007.
 *   Audit `audit:petshop_sale.complete`.
 * - `cancelSale`: draft/ completed → cancelled. completed
 *   satışlar için her satırın `reversal` hareketi oluşturulur
 *   (stok iade). Audit `audit:petshop_sale.cancel`.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Satış üzerinde fiziksel silme YOKTUR.
 *
 * @since GOAL-064 (FAZ-6) petshop POS core
 */

import { Injectable, Logger } from "@nestjs/common";

import { PetshopSalesRepository } from "./petshop-sales.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  addDecimalString,
  multiplyDecimalString,
  toPetshopSale,
  toPetshopSaleLine,
  type PetshopSaleLineRecord,
  type PetshopSaleRecord,
} from "../../common/petshop-sales/petshop-sale.types.js";
import { ProductsService } from "../products/products.service.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  PetshopSaleCancelInput,
  PetshopSaleCompleteInput,
  PetshopSaleCreateInput,
  PetshopSaleDetail,
  PetshopSaleFilters,
  PetshopSaleLineInput,
  PetshopSaleListResponse,
  PetshopSaleUpdateInput,
} from "@vetniva/contracts";

/** Decimal string'in negatif işaretli kopyası (çıkış). */
function toNegativeDecimal(value: string): string {
  return value === "0" || value === "0.00" ? "0" : `-${value}`;
}

@Injectable()
export class PetshopSalesService {
  private readonly logger = new Logger(PetshopSalesService.name);

  public constructor(
    private readonly repo: PetshopSalesRepository,
    private readonly products: ProductsService,
    private readonly stockMovements: StockMovementsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createSale (taslak)
  // -------------------------------------------------------------------------

  public async createSale(
    tenantId: string,
    input: PetshopSaleCreateInput,
    actor: ActorContext,
  ): Promise<PetshopSaleDetail> {
    this.requireTenantScope(actor, tenantId);

    // 1) Tüm ürünler arşivsiz olmalı.
    await this.assertProductsAvailable(tenantId, input.lines, actor);

    // 2) Header oluştur (önce insert, sonra satırlar).
    const nowIso = new Date().toISOString();
    const saleId = this.repo.nextId(tenantId);
    const header: PetshopSaleRecord = {
      id: saleId,
      tenantId,
      status: "draft",
      customerOwnerId: input.customerOwnerId ?? null,
      customerPatientId: input.customerPatientId ?? null,
      paymentMethod: input.paymentMethod,
      paidAmount: input.paidAmount,
      totalAmount: "0",
      globalDiscountPercent: input.globalDiscountPercent,
      netAmount: "0",
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

    // 3) Satırları ekle + toplam hesapla.
    const lineRecords = this.buildAndInsertLines(
      tenantId,
      saleId,
      input.lines,
      nowIso,
    );
    const totalAmount = this.sumLineTotals(lineRecords);
    const netAmount = this.applyGlobalDiscount(
      totalAmount,
      input.globalDiscountPercent,
    );

    this.repo.update(tenantId, saleId, {
      totalAmount,
      netAmount,
      updatedAt: nowIso,
    });
    const persistedHeader = this.repo.findById(tenantId, saleId);
    if (!persistedHeader) throw new Error("Petshop satış oluşturulamadı");
    await this.repo.persistSaleWithLines(persistedHeader, lineRecords);

    // 4) Audit.
    await this.audit.recordSimple(
      "audit:petshop_sale.create",
      "petshop_sale",
      saleId,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        lineCount: lineRecords.length,
        totalAmount,
        netAmount,
        paymentMethod: header.paymentMethod,
      },
    );

    const finalHeader = this.repo.findById(tenantId, saleId);
    if (!finalHeader) {
      throw new DomainError({
        errorCode: "VET-SALE-0001",
        message: "Satış bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      sale: toPetshopSale(finalHeader),
      lines: lineRecords.map((l) => toPetshopSaleLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // listSales
  // -------------------------------------------------------------------------

  public async listSales(
    tenantId: string,
    filters: PetshopSaleFilters,
    actor: ActorContext,
  ): Promise<PetshopSaleListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearch(tenantId, {
      status: filters.status,
      customerOwnerId: filters.customerOwnerId,
      customerPatientId: filters.customerPatientId,
      paymentMethod: filters.paymentMethod,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toPetshopSale(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getSaleDetail
  // -------------------------------------------------------------------------

  public async getSaleDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<PetshopSaleDetail | null> {
    this.requireTenantScope(actor, tenantId);
    const header = await this.repo.persistedById(tenantId, id);
    if (!header) return null;
    const lines = await this.repo.persistedLines(tenantId, id);
    return {
      sale: toPetshopSale(header),
      lines: lines.map((l) => toPetshopSaleLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // updateSale (yalnızca draft)
  // -------------------------------------------------------------------------

  public async updateSale(
    tenantId: string,
    id: string,
    input: PetshopSaleUpdateInput,
    actor: ActorContext,
  ): Promise<PetshopSaleDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-SALE-0001",
        message: "Satış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-SALE-0001",
        details: { id },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-SALE-0003",
        message: "Yalnızca taslak satışlar düzenlenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SALE-0003",
        details: { id, currentStatus: existing.status },
      });
    }

    if (input.lines !== undefined) {
      await this.assertProductsAvailable(tenantId, input.lines, actor);
      // Mevcut satırları updatedAt set edip listede bırakıyoruz
      // (draft senaryosunda henüz stok hareketi yok; ileride
      // GOAL-065 refund ile bu davranış netleşecek).
      const oldLines = await this.repo.persistedLines(tenantId, id);
      const nowIso = new Date().toISOString();
      for (const old of oldLines) {
        this.repo.updateLine(tenantId, old.id, { updatedAt: nowIso });
      }
      const newLines = this.buildAndInsertLines(
        tenantId,
        id,
        input.lines,
        nowIso,
      );
      const totalAmount = this.sumLineTotals(newLines);
      const netAmount = this.applyGlobalDiscount(
        totalAmount,
        input.globalDiscountPercent ?? existing.globalDiscountPercent,
      );
      await this.repo.persistedReplaceLines(tenantId, id, newLines);
      await this.repo.persistedUpdate(tenantId, id, {
        totalAmount,
        netAmount,
        updatedAt: nowIso,
      });
    }

    if (input.customerOwnerId !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        customerOwnerId: input.customerOwnerId,
        updatedAt: new Date().toISOString(),
      });
    }
    if (input.customerPatientId !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        customerPatientId: input.customerPatientId,
        updatedAt: new Date().toISOString(),
      });
    }
    if (input.paymentMethod !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        paymentMethod: input.paymentMethod,
        updatedAt: new Date().toISOString(),
      });
    }
    if (input.paidAmount !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        paidAmount: input.paidAmount,
        updatedAt: new Date().toISOString(),
      });
    }
    if (input.globalDiscountPercent !== undefined) {
      const t = await this.repo.persistedById(tenantId, id);
      if (t) {
        const netAmount = this.applyGlobalDiscount(
          t.totalAmount,
          input.globalDiscountPercent,
        );
        await this.repo.persistedUpdate(tenantId, id, {
          globalDiscountPercent: input.globalDiscountPercent,
          netAmount,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (input.notes !== undefined) {
      await this.repo.persistedUpdate(tenantId, id, {
        notes: input.notes,
        updatedAt: new Date().toISOString(),
      });
    }

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-SALE-0001",
        message: "Satış bulunamadı",
        httpStatus: 404,
      });
    }
    await this.audit.recordSimple(
      "audit:petshop_sale.update",
      "petshop_sale",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { linesChanged: input.lines !== undefined },
    );

    return {
      sale: toPetshopSale(updated),
      lines: (await this.repo.persistedLines(tenantId, id)).map((line) =>
        toPetshopSaleLine(line),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // completeSale (tahsilat + stok düşümü)
  // -------------------------------------------------------------------------

  public async completeSale(
    tenantId: string,
    id: string,
    input: PetshopSaleCompleteInput,
    actor: ActorContext,
  ): Promise<PetshopSaleDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-SALE-0001",
        message: "Satış bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-SALE-0002",
        message: "Yalnızca taslak satış tamamlanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SALE-0002",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    const lines = await this.repo.persistedLines(tenantId, id);

    // Her satır için stok düşümü.
    for (const line of lines) {
      const product = await this.products.getProduct(
        tenantId,
        line.productId,
        actor,
      );
      if (!product) {
        throw new DomainError({
          errorCode: "VET-SALE-0006",
          message: "Ürün bulunamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-SALE-0006",
          details: { productId: line.productId, lineId: line.id },
        });
      }
      // Stok takip edilen ürünler için hareket oluştur.
      if (product.purchaseTracked) {
        await this.stockMovements.createSystemMovement(
          tenantId,
          {
            type: "sale",
            productId: line.productId,
            quantity: toNegativeDecimal(line.quantity),
            unitPrice: line.unitPrice,
            occurredAt: nowIso,
            notes: `petshop_sale:${id}`,
          },
          actor,
          {
            systemSourceType: "petshop_sale",
            systemSourceId: id,
          },
        );
      }
    }

    const paymentMethod = input.paymentMethod ?? existing.paymentMethod;
    const paidAmount = input.paidAmount ?? existing.paidAmount;

    await this.repo.persistedUpdate(tenantId, id, {
      status: "completed",
      paymentMethod,
      paidAmount,
      completedAt: nowIso,
      completedBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:petshop_sale.complete",
      "petshop_sale",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        totalAmount: existing.totalAmount,
        netAmount: existing.netAmount,
        paymentMethod,
        paidAmount,
        lineCount: lines.length,
      },
    );

    const updated = await this.repo.persistedById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-SALE-0001",
        message: "Satış bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      sale: toPetshopSale(updated),
      lines: (await this.repo.persistedLines(tenantId, id)).map((line) =>
        toPetshopSaleLine(line),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // cancelSale
  // -------------------------------------------------------------------------

  public async cancelSale(
    tenantId: string,
    id: string,
    input: PetshopSaleCancelInput,
    actor: ActorContext,
  ): Promise<PetshopSaleDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-SALE-0001",
        message: "Satış bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-SALE-0004",
        message: "Satış zaten iptal edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-SALE-0004",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    // Tamamlanmış satışlarda ters kayıt (stok iade).
    if (existing.status === "completed") {
      const lines = await this.repo.persistedLines(tenantId, id);
      for (const line of lines) {
        const product = await this.products.getProduct(
          tenantId,
          line.productId,
          actor,
        );
        if (product?.purchaseTracked) {
          await this.stockMovements.createSystemMovement(
            tenantId,
            {
              type: "reversal",
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              reason: `sale cancel: ${input.reason}`,
              occurredAt: nowIso,
              notes: `petshop_sale_cancel:${id}`,
            },
            actor,
            {
              systemSourceType: "petshop_sale",
              systemSourceId: id,
            },
          );
        }
      }
    }

    await this.repo.persistedUpdate(tenantId, id, {
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: actor.actorId ?? "system",
      cancelReason: input.reason,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:petshop_sale.cancel",
      "petshop_sale",
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
        errorCode: "VET-SALE-0001",
        message: "Satış bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      sale: toPetshopSale(updated),
      lines: (await this.repo.persistedLines(tenantId, id)).map((line) =>
        toPetshopSaleLine(line),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async assertProductsAvailable(
    tenantId: string,
    lines: PetshopSaleLineInput[],
    actor: ActorContext,
  ): Promise<void> {
    for (const line of lines) {
      const product = await this.products.getProduct(
        tenantId,
        line.productId,
        actor,
      );
      if (!product) {
        throw new DomainError({
          errorCode: "VET-SALE-0006",
          message: "Ürün bulunamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-SALE-0006",
          details: { productId: line.productId },
        });
      }
      if (product.archivedAt !== null) {
        throw new DomainError({
          errorCode: "VET-SALE-0006",
          message: "Arşivlenmiş ürün satılamaz",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-SALE-0006",
          details: { productId: line.productId },
        });
      }
    }
  }

  private buildAndInsertLines(
    tenantId: string,
    saleId: string,
    inputs: PetshopSaleLineInput[],
    nowIso: string,
  ): PetshopSaleLineRecord[] {
    const records: PetshopSaleLineRecord[] = [];
    for (const line of inputs) {
      // lineTotal = quantity * unitPrice * (1 - discount/100)
      const gross = multiplyDecimalString(line.quantity, line.unitPrice);
      if (gross === null) {
        throw new DomainError({
          errorCode: "VET-SALE-0005",
          message: "Satır tutarı hesaplanamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-SALE-0005",
          details: {
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          },
        });
      }
      // İndirim yüzdesini uygula: 100% - discountPercent katsayısı.
      const factorNum = 100 - (line.discountPercent ?? 0);
      // gross * factor / 100
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
          errorCode: "VET-SALE-0005",
          message: "İndirim sonrası tutar hesaplanamadı",
          httpStatus: 422,
        });
      }
      const lineId = this.repo.nextLineId(tenantId);
      const rec: PetshopSaleLineRecord = {
        id: lineId,
        tenantId,
        saleId,
        productId: line.productId,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent ?? 0,
        lineTotal,
        notes: line.notes ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.repo.insertLine(rec);
      records.push(rec);
    }
    return records;
  }

  private sumLineTotals(lines: PetshopSaleLineRecord[]): string {
    let total = "0";
    for (const l of lines) {
      const sum = addDecimalString(total, l.lineTotal);
      if (sum === null) {
        throw new DomainError({
          errorCode: "VET-SALE-0005",
          message: "Toplam hesaplanamadı",
          httpStatus: 422,
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
    // (totalAmount * factorNum) / 100 — multiplyDecimalString ile
    // "0.01" çarparak 100'e bölme yapılır.
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

/**
 * Decimal string'i 100'e böl. 4 ondalık basamağa kadar. Geçersiz → null.
 */
function _divideBy100(value: string): string | null {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const parts = abs.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = parts[1] ?? "";
  // Bölme: 2 ondalık hassasiyet. Basit yaklaşım: scale'ı 2 arttır.
  const padded = (fracPart + "00").slice(0, Math.max(2, fracPart.length + 2));
  const combined = BigInt(intPart + padded);
  const divisor = BigInt(100);
  const quotient = combined / divisor;
  const remainder = combined % divisor;
  const qStr = quotient.toString();
  const rStr = remainder.toString().padStart(2, "0");
  // Sondaki sıfırları kırp.
  const rTrimmed = rStr.replace(/0+$/, "");
  const body = rTrimmed.length > 0 ? `${qStr}.${rTrimmed}` : qStr;
  return negative && body !== "0" ? `-${body}` : body;
}
