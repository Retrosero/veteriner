/**
 * @file Product (ürün/hizmet kataloğu) repository (in-memory).
 * @module apps/api/modules/products/products.repository
 *
 * @description GOAL-060 ürün ve hizmet kataloğu veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 * Production'a geçişte Prisma repository'si ile değiştirilecek (API
 * sözleşmesi sabit kalır).
 *
 * Üç yardımcı index tutulur:
 * - `byId`         — id → record (tenant scope'lu erişim).
 * - `bySku`        — tenantId|sku → record id (sku unique).
 * - `byBarcode`    — tenantId|barcode → record id (barcode unique).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-060 (FAZ-6) ürün ve hizmet kataloğu core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  ProductKind,
  ProductRecord,
} from "../../common/products/product.types.js";
import type { Prisma, ProductRecord as DbProduct } from "@prisma/client";

/** Patch tipi: kısmi güncelleme için izin verilen alanlar. */
export interface ProductPatch {
  sku?: string | null | undefined;
  barcode?: string | null | undefined;
  name?: string | undefined;
  category?: string | null | undefined;
  unit?: ProductRecord["unit"] | undefined;
  taxProfile?: ProductRecord["taxProfile"] | undefined;
  purchasePrice?: string | null | undefined;
  salePrice?: string | null | undefined;
  currency?: ProductRecord["currency"] | undefined;
  clinicUsage?: boolean | undefined;
  petshopUsage?: boolean | undefined;
  saleAvailable?: boolean | undefined;
  purchaseTracked?: boolean | undefined;
  requiresPrescription?: boolean | undefined;
  controlledDrug?: boolean | undefined;
  lowStockThreshold?: string | null | undefined;
  notes?: string | null | undefined;
  active?: boolean | undefined;
  updatedAt?: string | undefined;
  archivedAt?: string | null | undefined;
  archivedBy?: string | null | undefined;
  archiveReason?: string | null | undefined;
}

/** Arama filtreleri. */
export interface ProductSearchFilters {
  kind?: ProductKind | undefined;
  kinds?: ProductKind[] | undefined;
  clinicUsage?: boolean | undefined;
  petshopUsage?: boolean | undefined;
  search?: string | undefined;
  active?: boolean | undefined;
  category?: string | undefined;
  includeArchived?: boolean | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class ProductsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, ProductRecord>();
  /** key: tenantId|sku → record id (sku unique per tenant). */
  private readonly bySku = new Map<string, string>();
  /** key: tenantId|barcode → record id (barcode unique per tenant). */
  private readonly byBarcode = new Map<string, string>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için SKU counter (auto-generate için). */
  private readonly skuCounters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `prd-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `prd-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  /** Ürün kaydını tenant RLS bağlamında kalıcılaştırır. */
  public async persist(record: ProductRecord): Promise<ProductRecord> {
    if (!this.prisma) return this.insert(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.productRecord.create({ data: this.toCreateData(record) }),
    );
    this.insert(record);
    return this.map(row);
  }

  public async persistedFindById(
    tenantId: string,
    id: string,
  ): Promise<ProductRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.productRecord.findFirst({ where: { id, tenantId } }),
    );
    return row ? this.map(row) : null;
  }

  public async persistedFindBySku(
    tenantId: string,
    sku: string,
  ): Promise<ProductRecord | null> {
    if (!this.prisma) return this.findBySku(tenantId, sku);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.productRecord.findFirst({ where: { tenantId, sku } }),
    );
    return row ? this.map(row) : null;
  }

  public async persistedFindByBarcode(
    tenantId: string,
    barcode: string,
  ): Promise<ProductRecord | null> {
    if (!this.prisma) return this.findByBarcode(tenantId, barcode);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.productRecord.findFirst({ where: { tenantId, barcode } }),
    );
    return row ? this.map(row) : null;
  }

  public async persistedSearch(
    tenantId: string,
    filters: ProductSearchFilters,
  ): Promise<{ items: ProductRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, filters);
    const where: Prisma.ProductRecordWhereInput = {
      tenantId,
      ...(filters.includeArchived ? {} : { archivedAt: null }),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.kinds?.length ? { kind: { in: filters.kinds } } : {}),
      ...(filters.clinicUsage !== undefined
        ? { clinicUsage: filters.clinicUsage }
        : {}),
      ...(filters.petshopUsage !== undefined
        ? { petshopUsage: filters.petshopUsage }
        : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.category
        ? { category: { contains: filters.category, mode: "insensitive" } }
        : {}),
      ...(filters.search
        ? {
            OR: ["name", "sku", "barcode", "category"].map((field) => ({
              [field]: { contains: filters.search, mode: "insensitive" },
            })),
          }
        : {}),
    };
    const [rows, total] = await this.inTenant(tenantId, (tx) =>
      Promise.all([
        tx.productRecord.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: filters.offset,
          take: filters.limit,
        }),
        tx.productRecord.count({ where }),
      ]),
    );
    return { items: rows.map((row) => this.map(row)), total };
  }

  public async persistedUpdate(
    tenantId: string,
    id: string,
    patch: ProductPatch,
  ): Promise<ProductRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, patch);
    const data: Prisma.ProductRecordUpdateManyMutationInput = {
      ...(patch.sku !== undefined ? { sku: patch.sku } : {}),
      ...(patch.barcode !== undefined ? { barcode: patch.barcode } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.taxProfile !== undefined
        ? { taxProfile: patch.taxProfile }
        : {}),
      ...(patch.purchasePrice !== undefined
        ? { purchasePrice: patch.purchasePrice }
        : {}),
      ...(patch.salePrice !== undefined ? { salePrice: patch.salePrice } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.clinicUsage !== undefined
        ? { clinicUsage: patch.clinicUsage }
        : {}),
      ...(patch.petshopUsage !== undefined
        ? { petshopUsage: patch.petshopUsage }
        : {}),
      ...(patch.saleAvailable !== undefined
        ? { saleAvailable: patch.saleAvailable }
        : {}),
      ...(patch.purchaseTracked !== undefined
        ? { purchaseTracked: patch.purchaseTracked }
        : {}),
      ...(patch.requiresPrescription !== undefined
        ? { requiresPrescription: patch.requiresPrescription }
        : {}),
      ...(patch.controlledDrug !== undefined
        ? { controlledDrug: patch.controlledDrug }
        : {}),
      ...(patch.lowStockThreshold !== undefined
        ? { lowStockThreshold: patch.lowStockThreshold }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.updatedAt !== undefined
        ? { updatedAt: new Date(patch.updatedAt) }
        : {}),
      ...(patch.archivedAt !== undefined
        ? { archivedAt: patch.archivedAt ? new Date(patch.archivedAt) : null }
        : {}),
      ...(patch.archivedBy !== undefined
        ? { archivedBy: patch.archivedBy }
        : {}),
      ...(patch.archiveReason !== undefined
        ? { archiveReason: patch.archiveReason }
        : {}),
    };
    const result = await this.inTenant(tenantId, (tx) =>
      tx.productRecord.updateMany({ where: { id, tenantId }, data }),
    );
    return result.count ? this.persistedFindById(tenantId, id) : null;
  }

  private toCreateData(
    record: ProductRecord,
  ): Prisma.ProductRecordUncheckedCreateInput {
    return {
      ...record,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
    };
  }
  private map(row: DbProduct): ProductRecord {
    return {
      ...row,
      kind: row.kind as ProductRecord["kind"],
      unit: row.unit as ProductRecord["unit"],
      taxProfile: row.taxProfile as ProductRecord["taxProfile"],
      currency: row.currency as ProductRecord["currency"],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }
  private async inTenant<T>(
    tenantId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
      return callback(tx);
    });
  }

  /**
   * Auto-generate için sonraki SKU sayacı. Her çağrıda artar;
   * tenant düzeyinde monoton artan bir sayıdır. Arşivlenen
   * kayıtlar sayacı geri almaz (sayaç sadece artar).
   */
  public nextSkuCounter(tenantId: string): number {
    const n = (this.skuCounters.get(tenantId) ?? 0) + 1;
    this.skuCounters.set(tenantId, n);
    return n;
  }

  public insert(record: ProductRecord): ProductRecord {
    this.byId.set(record.id, record);
    if (record.sku !== null) {
      this.bySku.set(this.skuKey(record.tenantId, record.sku), record.id);
    }
    if (record.barcode !== null) {
      this.byBarcode.set(
        this.barcodeKey(record.tenantId, record.barcode),
        record.id,
      );
    }
    return record;
  }

  public findById(tenantId: string, id: string): ProductRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * SKU'ya göre tenant-scoped arama. SKU tenant içinde
   * benzersizdir. Arşivlenmiş kayıtlar da döner (caller
   * kontrol eder).
   */
  public findBySku(tenantId: string, sku: string): ProductRecord | null {
    const id = this.bySku.get(this.skuKey(tenantId, sku));
    if (!id) return null;
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Barkod'a göre tenant-scoped arama. Barkod tenant içinde
   * benzersizdir.
   */
  public findByBarcode(
    tenantId: string,
    barcode: string,
  ): ProductRecord | null {
    const id = this.byBarcode.get(this.barcodeKey(tenantId, barcode));
    if (!id) return null;
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Kısmi güncelleme. `undefined` alanlar atlanır; `null` alanlar
   * açıkça null yapılır (örn. `barcode`, `category`, `archivedAt`).
   * SKU/barcode değişirse index güncellenir.
   */
  public update(
    tenantId: string,
    id: string,
    patch: ProductPatch,
  ): ProductRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    // SKU değişiyorsa eski index'i sil.
    if (patch.sku !== undefined && patch.sku !== rec.sku) {
      if (rec.sku !== null) {
        this.bySku.delete(this.skuKey(rec.tenantId, rec.sku));
      }
      if (patch.sku !== null) {
        this.bySku.set(this.skuKey(rec.tenantId, patch.sku), rec.id);
      }
    }
    // Barcode değişiyorsa eski index'i sil.
    if (patch.barcode !== undefined && patch.barcode !== rec.barcode) {
      if (rec.barcode !== null) {
        this.byBarcode.delete(this.barcodeKey(rec.tenantId, rec.barcode));
      }
      if (patch.barcode !== null) {
        this.byBarcode.set(
          this.barcodeKey(rec.tenantId, patch.barcode),
          rec.id,
        );
      }
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.byId.set(id, rec);
    return rec;
  }

  /**
   * Tenant-scoped arama. Arşivlenmiş kayıtlar `includeArchived=true`
   * olmadıkça dönmez. `active` filtresi default=true ise
   * arşivlenmişleri yine de dışlar.
   */
  public search(
    tenantId: string,
    filters: ProductSearchFilters,
  ): { items: ProductRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();
    const categoryNeedle = filters.category?.toLowerCase().trim();

    const all: ProductRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (!filters.includeArchived && rec.archivedAt !== null) continue;
      if (filters.kind && rec.kind !== filters.kind) continue;
      if (filters.kinds && !filters.kinds.includes(rec.kind)) continue;
      if (
        filters.clinicUsage !== undefined &&
        rec.clinicUsage !== filters.clinicUsage
      )
        continue;
      if (
        filters.petshopUsage !== undefined &&
        rec.petshopUsage !== filters.petshopUsage
      )
        continue;
      if (filters.active !== undefined && rec.active !== filters.active)
        continue;
      if (categoryNeedle) {
        const cat = rec.category?.toLowerCase() ?? "";
        if (!cat.includes(categoryNeedle)) continue;
      }
      if (needle) {
        const hay = [
          rec.name,
          rec.sku ?? "",
          rec.barcode ?? "",
          rec.category ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      all.push(rec);
    }
    // En yeni kayıt üstte.
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.bySku.clear();
    this.byBarcode.clear();
    this.counters.clear();
    this.skuCounters.clear();
  }

  /** Record oluşturmak için yardımcı (service kullanır). */
  public toRecord(args: ProductRecord): ProductRecord {
    return { ...args };
  }

  private skuKey(tenantId: string, sku: string): string {
    return `${tenantId}|${sku}`;
  }

  private barcodeKey(tenantId: string, barcode: string): string {
    return `${tenantId}|${barcode}`;
  }
}
