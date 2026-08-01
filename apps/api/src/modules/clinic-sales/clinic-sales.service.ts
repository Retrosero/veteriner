/**
 * @file ClinicSale (klinik satış taslağı) service.
 * @module apps/api/modules/clinic-sales/clinic-sales.service
 * @description GOAL-071 (FAZ-7) klinik satış taslağı iş kuralları.
 *
 * İş kuralları:
 * - `createClinicSale` (taslak):
 *   - `customerOwnerId` ve `customerPatientId` zorunlu (UUID).
 *   - `sourceType` + `sourceId` zorunlu (kaynak klinik kayıt).
 *   - Her satır için ürün varlık + arşivsiz kontrolü (422
 *     VET-CLINIC_SALE-0005). service türünde ürünler de kabul
 *     edilir (muayene ücreti gibi).
 *   - `unitPrice` verilmediyse ürün `salePrice`'ından alınır.
 *   - İndirim yetkisi: STAFF/VETERINARIAN için max %10 (hem
 *     satır hem global), OWNER sınırsız. Aksi → 403
 *     VET-CLINIC_SALE-0004.
 *   - Audit `audit:clinic_sale.create`.
 * - `listClinicSales` / `getClinicSaleDetail`: tenant-scoped;
 *   cross-tenant → null.
 * - `updateClinicSale`: yalnızca `draft` durumda. İndirim
 *   yetkisi yine kontrol edilir. Audit
 *   `audit:clinic_sale.update`.
 * - `completeClinicSale`: draft → completed. Audit
 *   `audit:clinic_sale.complete`. Tahsilat (GOAL-072+) bu
 *   tick'te bağlanmaz.
 * - `cancelClinicSale`: draft/completed → cancelled. Audit
 *   `audit:clinic_sale.cancel`.
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Klinik satış üzerinde fiziksel silme YOKTUR.
 *
 * @since GOAL-071 (FAZ-7) klinik satış taslağı core
 */

import { Injectable, Logger } from "@nestjs/common";

import { ClinicSalesRepository } from "./clinic-sales.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import {
  addDecimalString,
  multiplyDecimalString,
  toClinicSale,
  toClinicSaleLine,
  type ClinicSaleLineRecord,
  type ClinicSaleRecord,
} from "../../common/clinic-sales/clinic-sale.types.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { ProductsService } from "../products/products.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  ClinicSaleCancelInput,
  ClinicSaleCreateInput,
  ClinicSaleDetail,
  ClinicSaleFilters,
  ClinicSaleLineInput,
  ClinicSaleListResponse,
  ClinicSaleUpdateInput,
} from "@vetniva/contracts";

/** İndirim yetki sınırı (satır + global, % cinsinden). */
const STAFF_MAX_DISCOUNT_PERCENT = 10;
const VETERINARIAN_MAX_DISCOUNT_PERCENT = 10;
/** OWNER için sınır yok. */

@Injectable()
export class ClinicSalesService {
  private readonly logger = new Logger(ClinicSalesService.name);

  public constructor(
    private readonly repo: ClinicSalesRepository,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createClinicSale (taslak)
  // -------------------------------------------------------------------------

  public async createClinicSale(
    tenantId: string,
    input: ClinicSaleCreateInput,
    actor: ActorContext,
  ): Promise<ClinicSaleDetail> {
    this.requireTenantScope(actor, tenantId);

    // 1) İndirim yetkisi kontrolü.
    this.assertDiscountAllowed(input.globalDiscountPercent, input.lines, actor);

    // 2) Ürün doğrulama (her satır).
    await this.assertProductsAvailable(tenantId, input.lines, actor);

    // 3) Header insert (önce), sonra satırlar.
    const nowIso = new Date().toISOString();
    const saleId = this.repo.nextId(tenantId);
    const header: ClinicSaleRecord = {
      id: saleId,
      tenantId,
      status: "draft",
      customerOwnerId: input.customerOwnerId,
      customerPatientId: input.customerPatientId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      currency: input.currency,
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

    // 4) Satırları ekle + toplam hesapla.
    const lineRecords = await this.buildAndInsertLines(
      tenantId,
      saleId,
      input.lines,
      nowIso,
      actor,
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

    // 5) Audit.
    await this.audit.recordSimple(
      "audit:clinic_sale.create",
      "clinic_sale",
      saleId,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        customerOwnerId: input.customerOwnerId,
        customerPatientId: input.customerPatientId,
        lineCount: lineRecords.length,
        totalAmount,
        netAmount,
      },
    );

    const finalHeader = this.repo.findById(tenantId, saleId);
    if (!finalHeader) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0001",
        message: "Klinik satış bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      sale: toClinicSale(finalHeader),
      lines: lineRecords.map((l) => toClinicSaleLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // listClinicSales
  // -------------------------------------------------------------------------

  public async listClinicSales(
    tenantId: string,
    filters: ClinicSaleFilters,
    actor: ActorContext,
  ): Promise<ClinicSaleListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      status: filters.status,
      customerOwnerId: filters.customerOwnerId,
      customerPatientId: filters.customerPatientId,
      sourceType: filters.sourceType,
      sourceId: filters.sourceId,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toClinicSale(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getClinicSaleDetail
  // -------------------------------------------------------------------------

  public async getClinicSaleDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<ClinicSaleDetail | null> {
    this.requireTenantScope(actor, tenantId);
    const header = this.repo.findById(tenantId, id);
    if (!header) return null;
    const lines = this.repo.listLinesBySale(tenantId, id);
    return {
      sale: toClinicSale(header),
      lines: lines.map((l) => toClinicSaleLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // updateClinicSale (yalnızca draft)
  // -------------------------------------------------------------------------

  public async updateClinicSale(
    tenantId: string,
    id: string,
    input: ClinicSaleUpdateInput,
    actor: ActorContext,
  ): Promise<ClinicSaleDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0001",
        message: "Klinik satış bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC_SALE-0001",
        details: { id },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0003",
        message: "Yalnızca taslak klinik satışlar düzenlenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CLINIC_SALE-0003",
        details: { id, currentStatus: existing.status },
      });
    }

    if (input.lines !== undefined) {
      this.assertDiscountAllowed(
        input.globalDiscountPercent ?? existing.globalDiscountPercent,
        input.lines,
        actor,
      );
      await this.assertProductsAvailable(tenantId, input.lines, actor);

      const nowIso = new Date().toISOString();
      // Eski satırları updatedAt set edip bırakıyoruz (draft'ta
      // henüz stok/ödeme etkisi yok).
      const oldLines = this.repo.listLinesBySale(tenantId, id);
      for (const _old of oldLines) {
        // Şu an için satır delete API'si yok; updatedAt set
        // edilir. Faz 8'de cancelLine eklenecek.
        this.repo.update(tenantId, id, { updatedAt: nowIso });
      }
      const newLines = await this.buildAndInsertLines(
        tenantId,
        id,
        input.lines,
        nowIso,
        actor,
      );
      const totalAmount = this.sumLineTotals(newLines);
      const netAmount = this.applyGlobalDiscount(
        totalAmount,
        input.globalDiscountPercent ?? existing.globalDiscountPercent,
      );
      this.repo.update(tenantId, id, {
        totalAmount,
        netAmount,
        updatedAt: nowIso,
      });
    }

    if (input.globalDiscountPercent !== undefined) {
      this.assertDiscountAllowed(
        input.globalDiscountPercent,
        input.lines ?? [],
        actor,
      );
      const t = this.repo.findById(tenantId, id);
      if (t) {
        const netAmount = this.applyGlobalDiscount(
          t.totalAmount,
          input.globalDiscountPercent,
        );
        this.repo.update(tenantId, id, {
          globalDiscountPercent: input.globalDiscountPercent,
          netAmount,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (input.notes !== undefined) {
      this.repo.update(tenantId, id, {
        notes: input.notes,
        updatedAt: new Date().toISOString(),
      });
    }

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0001",
        message: "Klinik satış bulunamadı",
        httpStatus: 404,
      });
    }
    await this.audit.recordSimple(
      "audit:clinic_sale.update",
      "clinic_sale",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { linesChanged: input.lines !== undefined },
    );

    return {
      sale: toClinicSale(updated),
      lines: this.repo
        .listLinesBySale(tenantId, id)
        .map((l) => toClinicSaleLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // completeClinicSale
  // -------------------------------------------------------------------------

  public async completeClinicSale(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<ClinicSaleDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0001",
        message: "Klinik satış bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0002",
        message: "Yalnızca taslak klinik satış tamamlanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CLINIC_SALE-0002",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "completed",
      completedAt: nowIso,
      completedBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:clinic_sale.complete",
      "clinic_sale",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        sourceType: existing.sourceType,
        sourceId: existing.sourceId,
        totalAmount: existing.totalAmount,
        netAmount: existing.netAmount,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0001",
        message: "Klinik satış bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      sale: toClinicSale(updated),
      lines: this.repo
        .listLinesBySale(tenantId, id)
        .map((l) => toClinicSaleLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // cancelClinicSale
  // -------------------------------------------------------------------------

  public async cancelClinicSale(
    tenantId: string,
    id: string,
    input: ClinicSaleCancelInput,
    actor: ActorContext,
  ): Promise<ClinicSaleDetail> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0001",
        message: "Klinik satış bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0006",
        message: "Klinik satış zaten iptal edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CLINIC_SALE-0006",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: actor.actorId ?? "system",
      cancelReason: input.reason,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:clinic_sale.cancel",
      "clinic_sale",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        previousStatus: existing.status,
        reason: input.reason,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0001",
        message: "Klinik satış bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      sale: toClinicSale(updated),
      lines: this.repo
        .listLinesBySale(tenantId, id)
        .map((l) => toClinicSaleLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private assertDiscountAllowed(
    globalDiscountPercent: number,
    lines: ClinicSaleLineInput[],
    actor: ActorContext,
  ): void {
    if (actor.role === "OWNER" || actor.role === "SUPERADMIN") {
      return;
    }
    const max =
      actor.role === "VETERINARIAN"
        ? VETERINARIAN_MAX_DISCOUNT_PERCENT
        : actor.role === "STAFF"
          ? STAFF_MAX_DISCOUNT_PERCENT
          : 0;
    if (max === 0) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0004",
        message: "Bu rol için indirim uygulanamaz",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-CLINIC_SALE-0004",
      });
    }
    if (globalDiscountPercent > max) {
      throw new DomainError({
        errorCode: "VET-CLINIC_SALE-0004",
        message: `Bu rol için global indirim %${max}'i aşamaz`,
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-CLINIC_SALE-0004",
        details: { globalDiscountPercent, max, role: actor.role },
      });
    }
    for (const line of lines) {
      const dp = line.discountPercent ?? 0;
      if (dp > max) {
        throw new DomainError({
          errorCode: "VET-CLINIC_SALE-0004",
          message: `Bu rol için satır indirimi %${max}'i aşamaz`,
          httpStatus: 403,
          severity: "warning",
          i18nKey: "error.VET-CLINIC_SALE-0004",
          details: {
            productId: line.productId,
            discountPercent: dp,
            max,
            role: actor.role,
          },
        });
      }
    }
  }

  private async assertProductsAvailable(
    tenantId: string,
    lines: ClinicSaleLineInput[],
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
          errorCode: "VET-CLINIC_SALE-0005",
          message: "Ürün bulunamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CLINIC_SALE-0005",
          details: { productId: line.productId },
        });
      }
      if (product.archivedAt !== null) {
        throw new DomainError({
          errorCode: "VET-CLINIC_SALE-0005",
          message: "Arşivlenmiş ürün satılamaz",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CLINIC_SALE-0005",
          details: { productId: line.productId },
        });
      }
    }
  }

  private async buildAndInsertLines(
    tenantId: string,
    saleId: string,
    inputs: ClinicSaleLineInput[],
    nowIso: string,
    actor: ActorContext,
  ): Promise<ClinicSaleLineRecord[]> {
    const records: ClinicSaleLineRecord[] = [];
    for (const line of inputs) {
      const product = await this.products.getProduct(
        tenantId,
        line.productId,
        actor,
      );
      if (!product) {
        throw new DomainError({
          errorCode: "VET-CLINIC_SALE-0005",
          message: "Ürün bulunamadı",
          httpStatus: 422,
        });
      }
      const unitPrice = line.unitPrice ?? product.salePrice;
      if (unitPrice === null) {
        throw new DomainError({
          errorCode: "VET-CLINIC_SALE-0007",
          message: "Ürün için satış fiyatı tanımlı değil",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CLINIC_SALE-0007",
          details: { productId: line.productId },
        });
      }
      const gross = multiplyDecimalString(line.quantity, unitPrice);
      if (gross === null) {
        throw new DomainError({
          errorCode: "VET-CLINIC_SALE-0007",
          message: "Satır tutarı hesaplanamadı",
          httpStatus: 422,
        });
      }
      const dp = line.discountPercent ?? 0;
      const factorNum = 100 - dp;
      const discounted = multiplyDecimalString(gross, factorNum.toString());
      const lineTotal =
        discounted === null ? null : multiplyDecimalString(discounted, "0.01");
      if (lineTotal === null) {
        throw new DomainError({
          errorCode: "VET-CLINIC_SALE-0007",
          message: "İndirim sonrası tutar hesaplanamadı",
          httpStatus: 422,
        });
      }
      const lineId = this.repo.nextLineId(tenantId);
      const rec: ClinicSaleLineRecord = {
        id: lineId,
        tenantId,
        saleId,
        productId: line.productId,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice,
        discountPercent: dp,
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

  private sumLineTotals(lines: ClinicSaleLineRecord[]): string {
    let total = "0";
    for (const l of lines) {
      const sum = addDecimalString(total, l.lineTotal);
      if (sum === null) {
        throw new DomainError({
          errorCode: "VET-CLINIC_SALE-0007",
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
