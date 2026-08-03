/**
 * @file Product (ürün/hizmet kataloğu) service.
 * @module apps/api/modules/products/products.service
 *
 * @description GOAL-060 (FAZ-6) ürün ve hizmet kataloğu iş kuralları.
 * Klinik + petshop ortak katalog; tek tip (Product) üzerinden 5 tür
 * (stock_product, medicine, vaccine, service, consumable) temsil edilir.
 *
 * İş kuralları:
 * - `createProduct`:
 *   - SKU verilmediyse otomatik üretilir (`prd-{kindChar}{6}`).
 *   - SKU tenant içinde benzersiz (duplicate → 409 VET-PRODUCT-0002).
 *   - Barkod verildiyse tenant içinde benzersiz (duplicate → 409
 *     VET-PRODUCT-0002).
 *   - Tür alanlarına göre kind-specific validasyonlar (örn.
 *     `medicine` için `requiresPrescription` tip bilgisi; burada
 *     sadece audit log'a yansır).
 *   - `vaccine` türünde `vaccineProtocolId` opsiyonel; Faz 5
 *     entegrasyonu Faz 6 ilerleyen goal'larında bağlanacak.
 *   - Audit `audit:product.create` (info).
 * - `listProducts`: tenant-scoped; kind/kinds/clinic/petshop/
 *   search/category/active filtreleri; arşivlenmiş kayıtlar dönmez.
 * - `getProduct`: tenant-scoped; cross-tenant → null.
 * - `updateProduct`: kısmi güncelleme; arşivli kayıt güncellenemez
 *   (409 VET-PRODUCT-0004). SKU değişirse unique kontrolü yapılır.
 *   Audit `audit:product.update` (info).
 * - `archiveProduct`: `archivedAt` set edilir; soft delete. Zaten
 *   arşivlenmişse 409 VET-PRODUCT-0003. Audit
 *   `audit:product.archive` (warning).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Ürün üzerinde fiziksel
 *   silme YOKTUR.
 *
 * @since GOAL-060 (FAZ-6) ürün ve hizmet kataloğu core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type ProductPatch,
  ProductsRepository,
} from "./products.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  generateSku,
  normalizeDecimalString,
  toProduct,
  type ProductRecord,
} from "../../common/products/product.types.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  Product,
  ProductArchiveInput,
  ProductCreateInput,
  ProductFilters,
  ProductListResponse,
  ProductUpdateInput,
} from "@vetniva/contracts";

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  public constructor(
    private readonly repo: ProductsRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createProduct
  // -------------------------------------------------------------------------

  public async createProduct(
    tenantId: string,
    input: ProductCreateInput,
    actor: ActorContext,
  ): Promise<Product> {
    this.requireTenantScope(actor, tenantId);

    // 1) Fiyat string'leri normalize et.
    const purchasePrice = this.normalizeCreatePriceOrThrow(
      input.purchasePrice,
      "purchasePrice",
    );
    const salePrice = this.normalizeCreatePriceOrThrow(
      input.salePrice,
      "salePrice",
    );
    // 1b) Düşük stok eşiği (FAZ-6 GOAL-067).
    const lowStockThreshold = this.normalizeCreateThresholdOrThrow(
      input.lowStockThreshold,
    );

    // 2) SKU: verildiyse unique kontrolü; yoksa otomatik üret.
    const sku = input.sku ?? null;
    if (sku !== null) {
      const existingBySku = await this.repo.persistedFindBySku(tenantId, sku);
      if (existingBySku && existingBySku.archivedAt === null) {
        throw new DomainError({
          errorCode: "VET-PRODUCT-0002",
          message: "Bu SKU zaten kayıtlı",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-PRODUCT-0002",
          details: { sku },
        });
      }
    }

    // 3) Barkod unique kontrolü.
    if (input.barcode !== undefined) {
      const existingByBarcode = await this.repo.persistedFindByBarcode(
        tenantId,
        input.barcode,
      );
      if (existingByBarcode && existingByBarcode.archivedAt === null) {
        throw new DomainError({
          errorCode: "VET-PRODUCT-0002",
          message: "Bu barkod zaten kayıtlı",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-PRODUCT-0002",
          details: { barcode: input.barcode },
        });
      }
    }

    // 4) ID üret + otomatik SKU ataması.
    const id = this.repo.nextId(tenantId);
    const finalSku =
      sku ?? generateSku(input.kind, this.repo.nextSkuCounter(tenantId));

    // 5) Repository'ye ekle.
    const nowIso = new Date().toISOString();
    const record: ProductRecord = this.repo.toRecord({
      id,
      tenantId,
      kind: input.kind,
      sku: finalSku,
      barcode: input.barcode ?? null,
      name: input.name,
      category: input.category ?? null,
      unit: input.unit,
      taxProfile: input.taxProfile,
      purchasePrice,
      salePrice,
      currency: input.currency,
      clinicUsage: input.clinicUsage,
      petshopUsage: input.petshopUsage,
      saleAvailable: input.saleAvailable,
      purchaseTracked: input.purchaseTracked,
      vaccineProtocolId:
        input.kind === "vaccine" ? (input.vaccineProtocolId ?? null) : null,
      requiresPrescription: input.requiresPrescription,
      controlledDrug: input.controlledDrug,
      lowStockThreshold,
      notes: input.notes ?? null,
      active: true,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    });
    await this.repo.persist(record);

    // 6) Audit.
    await this.audit.recordSimple(
      "audit:product.create",
      "product",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        kind: record.kind,
        sku: record.sku,
        barcode: record.barcode,
        name: record.name,
        unit: record.unit,
        taxProfile: record.taxProfile,
        clinicUsage: record.clinicUsage,
        petshopUsage: record.petshopUsage,
        saleAvailable: record.saleAvailable,
        purchaseTracked: record.purchaseTracked,
        requiresPrescription: record.requiresPrescription,
        controlledDrug: record.controlledDrug,
        hasPurchasePrice: record.purchasePrice !== null,
        hasSalePrice: record.salePrice !== null,
        currency: record.currency,
        vaccineProtocolId: record.vaccineProtocolId,
        hasLowStockThreshold: record.lowStockThreshold !== null,
      },
    );

    return toProduct(record);
  }

  // -------------------------------------------------------------------------
  // listProducts
  // -------------------------------------------------------------------------

  public async listProducts(
    tenantId: string,
    filters: ProductFilters,
    actor: ActorContext,
  ): Promise<ProductListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedSearch(tenantId, {
      kind: filters.kind,
      kinds: filters.kinds,
      clinicUsage: filters.clinicUsage,
      petshopUsage: filters.petshopUsage,
      search: filters.search,
      active: filters.active,
      category: filters.category,
      includeArchived: false,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toProduct(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getProduct
  // -------------------------------------------------------------------------

  public async getProduct(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Product | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.persistedFindById(tenantId, id);
    return rec ? toProduct(rec) : null;
  }

  // -------------------------------------------------------------------------
  // updateProduct
  // -------------------------------------------------------------------------

  public async updateProduct(
    tenantId: string,
    id: string,
    input: ProductUpdateInput,
    actor: ActorContext,
  ): Promise<Product> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedFindById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PRODUCT-0001",
        message: "Ürün bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRODUCT-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-PRODUCT-0004",
        message: "Arşivlenmiş ürün güncellenemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRODUCT-0004",
        details: { id },
      });
    }

    // Fiyat string'leri normalize et (update: undefined veya null olabilir).
    const purchasePrice = this.normalizeUpdatePriceOrThrow(
      input.purchasePrice,
      "purchasePrice",
    );
    const salePrice = this.normalizeUpdatePriceOrThrow(
      input.salePrice,
      "salePrice",
    );
    // Düşük stok eşiği (update: undefined veya null olabilir).
    const lowStockThreshold = this.normalizeUpdateThresholdOrThrow(
      input.lowStockThreshold,
    );

    // SKU unique kontrolü.
    if (input.sku !== undefined && input.sku !== existing.sku) {
      const dupe = await this.repo.persistedFindBySku(tenantId, input.sku);
      if (dupe && dupe.id !== id && dupe.archivedAt === null) {
        throw new DomainError({
          errorCode: "VET-PRODUCT-0002",
          message: "Bu SKU zaten kayıtlı",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-PRODUCT-0002",
          details: { sku: input.sku },
        });
      }
    }
    // Barkod unique kontrolü (null = temizle, kontrol gereksiz).
    if (
      input.barcode !== undefined &&
      input.barcode !== null &&
      input.barcode !== existing.barcode
    ) {
      const dupe = await this.repo.persistedFindByBarcode(
        tenantId,
        input.barcode,
      );
      if (dupe && dupe.id !== id && dupe.archivedAt === null) {
        throw new DomainError({
          errorCode: "VET-PRODUCT-0002",
          message: "Bu barkod zaten kayıtlı",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-PRODUCT-0002",
          details: { barcode: input.barcode },
        });
      }
    }

    // Patch oluştur.
    const patch: ProductPatch = {};
    if (input.sku !== undefined) patch.sku = input.sku;
    if (input.barcode !== undefined) patch.barcode = input.barcode;
    if (input.name !== undefined) patch.name = input.name;
    if (input.category !== undefined) patch.category = input.category;
    if (input.unit !== undefined) patch.unit = input.unit;
    if (input.taxProfile !== undefined) patch.taxProfile = input.taxProfile;
    if (input.purchasePrice !== undefined) patch.purchasePrice = purchasePrice;
    if (input.salePrice !== undefined) patch.salePrice = salePrice;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.clinicUsage !== undefined) patch.clinicUsage = input.clinicUsage;
    if (input.petshopUsage !== undefined)
      patch.petshopUsage = input.petshopUsage;
    if (input.saleAvailable !== undefined)
      patch.saleAvailable = input.saleAvailable;
    if (input.purchaseTracked !== undefined)
      patch.purchaseTracked = input.purchaseTracked;
    if (input.requiresPrescription !== undefined)
      patch.requiresPrescription = input.requiresPrescription;
    if (input.controlledDrug !== undefined)
      patch.controlledDrug = input.controlledDrug;
    if (input.lowStockThreshold !== undefined)
      patch.lowStockThreshold = lowStockThreshold;
    if (input.notes !== undefined) patch.notes = input.notes;

    const nowIso = new Date().toISOString();
    patch.updatedAt = nowIso;

    const updated = await this.repo.persistedUpdate(tenantId, id, patch);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PRODUCT-0001",
        message: "Ürün bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRODUCT-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:product.update",
      "product",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: {
          name: existing.name,
          unit: existing.unit,
          taxProfile: existing.taxProfile,
          saleAvailable: existing.saleAvailable,
          purchaseTracked: existing.purchaseTracked,
          clinicUsage: existing.clinicUsage,
          petshopUsage: existing.petshopUsage,
        },
        after: {
          name: updated.name,
          unit: updated.unit,
          taxProfile: updated.taxProfile,
          saleAvailable: updated.saleAvailable,
          purchaseTracked: updated.purchaseTracked,
          clinicUsage: updated.clinicUsage,
          petshopUsage: updated.petshopUsage,
        },
      },
    );

    return toProduct(updated);
  }

  // -------------------------------------------------------------------------
  // archiveProduct
  // -------------------------------------------------------------------------

  public async archiveProduct(
    tenantId: string,
    id: string,
    input: ProductArchiveInput,
    actor: ActorContext,
  ): Promise<Product> {
    this.requireTenantScope(actor, tenantId);
    const existing = await this.repo.persistedFindById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PRODUCT-0001",
        message: "Ürün bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRODUCT-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-PRODUCT-0003",
        message: "Ürün zaten arşivlenmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRODUCT-0003",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    const archivedBy = actor.actorId ?? "system";
    const updated = await this.repo.persistedUpdate(tenantId, id, {
      archivedAt: nowIso,
      archivedBy,
      archiveReason: input.reason,
      active: false,
      updatedAt: nowIso,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PRODUCT-0001",
        message: "Ürün bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRODUCT-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:product.archive",
      "product",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        name: existing.name,
        sku: existing.sku,
        kind: existing.kind,
        reason: input.reason,
      },
    );

    return toProduct(updated);
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

  /**
   * Create akışında decimal string'i normalize et.
   * `undefined` → null (caller ayarlamamış). Geçersiz format → 422.
   */
  private normalizeCreatePriceOrThrow(
    value: string | undefined,
    field: "purchasePrice" | "salePrice",
  ): string | null {
    if (value === undefined) return null;
    const normalized = normalizeDecimalString(value);
    if (normalized === null) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: `${field} geçersiz format`,
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { field, value },
      });
    }
    return normalized;
  }

  /**
   * Update akışında decimal string'i normalize et. `null` da
   * kabul edilir (alanı temizle). `undefined` → undefined
   * (dokunma). Geçersiz format → 422.
   */
  private normalizeUpdatePriceOrThrow(
    value: string | null | undefined,
    field: "purchasePrice" | "salePrice",
  ): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = normalizeDecimalString(value);
    if (normalized === null) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: `${field} geçersiz format`,
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { field, value },
      });
    }
    return normalized;
  }

  /**
   * Create akışında düşük stok eşiği (FAZ-6 GOAL-067) normalize
   * eder. `undefined` → null. Geçersiz format → 422 VET-VALIDATION-0010.
   * Pozitif sayı zorunlu (0 anlamsız; eşik 0 ise zaten daima uyarı).
   */
  private normalizeCreateThresholdOrThrow(
    value: string | undefined,
  ): string | null {
    if (value === undefined) return null;
    const normalized = normalizeDecimalString(value);
    if (normalized === null) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "lowStockThreshold geçersiz format",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { field: "lowStockThreshold", value },
      });
    }
    return normalized;
  }

  /**
   * Update akışında düşük stok eşiği normalize eder. `null`
   * kabul edilir (eşiği temizle, uyarı hesaplanmasın). `undefined`
   * → undefined (dokunma). Geçersiz format → 422.
   */
  private normalizeUpdateThresholdOrThrow(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return this.normalizeCreateThresholdOrThrow(value);
  }
}
