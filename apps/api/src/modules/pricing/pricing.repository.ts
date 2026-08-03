/**
 * @file Fiyat listeleri ve fiyat satırları repository (in-memory).
 * @module apps/api/modules/pricing/pricing.repository
 *
 * @description GOAL-070 (FAZ-7) tenant bazlı fiyat listesi altyapısı
 * veri erişim katmanı. DB migration sonraya bırakıldı; tenant-scoped
 * in-memory Map kullanılır. Production'a geçişte Prisma repository'si
 * ile değiştirilecek (API sözleşmesi sabit kalır).
 *
 * İndeksler:
 * - `listsById`           — id → PriceListRecord.
 * - `itemsById`           — id → PriceListItemRecord.
 * - `itemsByList`         — priceListId → Set<itemId>.
 * - `activeItemsByProduct` — (productId) → Set<itemId> (yalnızca
 *                            `status='active'`).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-070 (FAZ-7) fiyat listeleri ve hizmet ücretleri core
 */

import { Injectable, Optional } from "@nestjs/common";
import type {
  Prisma,
  PriceListItemRecord as DbItem,
  PriceListRecord as DbList,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  PriceListItemRecord,
  PriceListRecord,
} from "../../common/pricing/pricing.types.js";

/** PriceList kısmi güncelleme alanları. */
export interface PriceListPatch {
  name?: string | undefined;
  description?: string | null | undefined;
  taxProfile?: PriceListRecord["taxProfile"] | null | undefined;
  validFrom?: string | null | undefined;
  validUntil?: string | null | undefined;
  status?: PriceListRecord["status"] | undefined;
  updatedAt?: string | undefined;
  archivedAt?: string | null | undefined;
  archivedBy?: string | null | undefined;
  archiveReason?: string | null | undefined;
}

/** PriceList kısmi güncelleme alanları. */
export interface PriceListItemPatch {
  status?: PriceListItemRecord["status"] | undefined;
  notes?: string | null | undefined;
}

/** Fiyat listesi arama filtreleri. */
export interface PriceListSearchFilters {
  type?: PriceListRecord["type"] | undefined;
  status?: PriceListRecord["status"] | undefined;
  customerId?: string | undefined;
  /** Tarih filtresi; belirtilen tarihte geçerli olan listeler döner. */
  effectiveAt?: Date | undefined;
  search?: string | undefined;
  includeArchived?: boolean | undefined;
  limit: number;
  offset: number;
}

/** Fiyat satırı arama filtreleri. */
export interface PriceListItemSearchFilters {
  productId?: string | undefined;
  status?: PriceListItemRecord["status"] | undefined;
  /** List düzeyinde tarih filtresi (geçerli item). */
  effectiveAt?: Date | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class PricingRepository {
  /** key: id → record. */
  private readonly listsById = new Map<string, PriceListRecord>();
  /** key: id → record. */
  private readonly itemsById = new Map<string, PriceListItemRecord>();
  /** key: priceListId → Set<itemId>. */
  private readonly itemsByList = new Map<string, Set<string>>();
  /** key: tenantId|productId → Set<itemId> (yalnızca active). */
  private readonly activeItemsByProduct = new Map<string, Set<string>>();
  /** Her tenant için id counter. */
  private readonly listCounters = new Map<string, number>();
  private readonly itemCounters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  // -------------------------------------------------------------------------
  // PriceList ID
  // -------------------------------------------------------------------------

  public nextListId(tenantId: string): string {
    if (this.prisma) return `prl-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.listCounters.get(tenantId) ?? 0) + 1;
    this.listCounters.set(tenantId, n);
    return `prl-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextItemId(tenantId: string): string {
    if (this.prisma) return `pri-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.itemCounters.get(tenantId) ?? 0) + 1;
    this.itemCounters.set(tenantId, n);
    return `pri-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // PriceList CRUD
  // -------------------------------------------------------------------------

  public insertList(record: PriceListRecord): PriceListRecord {
    this.listsById.set(record.id, record);
    return record;
  }
  public async persistList(record: PriceListRecord): Promise<PriceListRecord> {
    if (!this.prisma) return this.insertList(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.priceListRecord.create({
        data: {
          ...record,
          validFrom: record.validFrom ? new Date(record.validFrom) : null,
          validUntil: record.validUntil ? new Date(record.validUntil) : null,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
          archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
        },
      }),
    );
    return this.mapList(row);
  }
  public async persistedListById(
    tenantId: string,
    id: string,
  ): Promise<PriceListRecord | null> {
    if (!this.prisma) return this.findListById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.priceListRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapList(row) : null;
  }
  public async persistedUpdateList(
    tenantId: string,
    id: string,
    p: PriceListPatch,
  ): Promise<PriceListRecord | null> {
    if (!this.prisma) return this.updateList(tenantId, id, p);
    const data: Prisma.PriceListRecordUpdateManyMutationInput = {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.taxProfile !== undefined ? { taxProfile: p.taxProfile } : {}),
      ...(p.validFrom !== undefined
        ? { validFrom: p.validFrom ? new Date(p.validFrom) : null }
        : {}),
      ...(p.validUntil !== undefined
        ? { validUntil: p.validUntil ? new Date(p.validUntil) : null }
        : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.updatedAt !== undefined
        ? { updatedAt: new Date(p.updatedAt) }
        : {}),
      ...(p.archivedAt !== undefined
        ? { archivedAt: p.archivedAt ? new Date(p.archivedAt) : null }
        : {}),
      ...(p.archivedBy !== undefined ? { archivedBy: p.archivedBy } : {}),
      ...(p.archiveReason !== undefined
        ? { archiveReason: p.archiveReason }
        : {}),
    };
    const r = await this.inTenant(tenantId, (tx) =>
      tx.priceListRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return r.count ? this.persistedListById(tenantId, id) : null;
  }
  public async persistedItemCount(
    tenantId: string,
    priceListId: string,
  ): Promise<number> {
    if (!this.prisma) return this.countItemsForList(priceListId);
    return this.inTenant(tenantId, (tx) =>
      tx.priceListItemRecord.count({ where: { tenantId, priceListId } }),
    );
  }
  public async persistedActiveItemCount(
    tenantId: string,
    priceListId: string,
  ): Promise<number> {
    if (!this.prisma) return this.countActiveItemsForList(priceListId);
    return this.inTenant(tenantId, (tx) =>
      tx.priceListItemRecord.count({
        where: { tenantId, priceListId, status: "active" },
      }),
    );
  }
  public async persistedSearchLists(
    tenantId: string,
    filters: PriceListSearchFilters,
  ): Promise<{ items: PriceListRecord[]; total: number }> {
    if (!this.prisma) return this.searchLists(tenantId, filters);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.priceListRecord.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      }),
    );
    const needle = filters.search?.toLowerCase().trim();
    const all = rows
      .map((row) => this.mapList(row))
      .filter((rec) => {
        if (!filters.includeArchived && rec.archivedAt !== null) return false;
        if (filters.type && rec.type !== filters.type) return false;
        if (filters.status && rec.status !== filters.status) return false;
        if (
          filters.customerId !== undefined &&
          rec.customerId !== filters.customerId
        )
          return false;
        if (
          filters.effectiveAt &&
          !this.isListEffectiveAt(rec, filters.effectiveAt)
        )
          return false;
        return (
          !needle ||
          [rec.name, rec.description ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        );
      });
    return {
      items: all.slice(filters.offset, filters.offset + filters.limit),
      total: all.length,
    };
  }

  public findListById(tenantId: string, id: string): PriceListRecord | null {
    const rec = this.listsById.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateList(
    tenantId: string,
    id: string,
    patch: PriceListPatch,
  ): PriceListRecord | null {
    const rec = this.findListById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.listsById.set(id, rec);
    return rec;
  }

  /**
   * Tenant-scoped arama. Arşivlenmiş kayıtlar `includeArchived=true`
   * olmadıkça dönmez.
   */
  public searchLists(
    tenantId: string,
    filters: PriceListSearchFilters,
  ): { items: PriceListRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: PriceListRecord[] = [];
    for (const rec of this.listsById.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (!filters.includeArchived && rec.archivedAt !== null) continue;
      if (filters.type && rec.type !== filters.type) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (
        filters.customerId !== undefined &&
        rec.customerId !== filters.customerId
      )
        continue;
      if (
        filters.effectiveAt &&
        !this.isListEffectiveAt(rec, filters.effectiveAt)
      )
        continue;
      if (needle) {
        const hay = [rec.name, rec.description ?? ""].join(" ").toLowerCase();
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

  // -------------------------------------------------------------------------
  // PriceListItem CRUD
  // -------------------------------------------------------------------------

  public insertItem(record: PriceListItemRecord): PriceListItemRecord {
    this.itemsById.set(record.id, record);
    // itemsByList indeksini güncelle.
    let set = this.itemsByList.get(record.priceListId);
    if (!set) {
      set = new Set();
      this.itemsByList.set(record.priceListId, set);
    }
    set.add(record.id);
    // activeItemsByProduct indeksini güncelle.
    if (record.status === "active") {
      this.addActiveItemForProduct(
        record.tenantId,
        record.productId,
        record.id,
      );
    }
    return record;
  }
  public async persistItem(
    record: PriceListItemRecord,
  ): Promise<PriceListItemRecord> {
    if (!this.prisma) return this.insertItem(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.priceListItemRecord.create({
        data: {
          ...record,
          validFrom: record.validFrom ? new Date(record.validFrom) : null,
          validUntil: record.validUntil ? new Date(record.validUntil) : null,
          createdAt: new Date(record.createdAt),
        },
      }),
    );
    return this.mapItem(row);
  }
  public async persistedItemsByProduct(
    tenantId: string,
    productId: string,
  ): Promise<PriceListItemRecord[]> {
    if (!this.prisma) return this.findActiveItemsByProduct(tenantId, productId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.priceListItemRecord.findMany({
        where: { tenantId, productId, status: "active" },
        orderBy: { createdAt: "desc" },
      }),
    );
    return rows.map((row) => this.mapItem(row));
  }
  public async persistedItemById(
    tenantId: string,
    id: string,
  ): Promise<PriceListItemRecord | null> {
    if (!this.prisma) return this.findItemById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.priceListItemRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapItem(row) : null;
  }
  public async persistedUpdateItem(
    tenantId: string,
    id: string,
    p: PriceListItemPatch,
  ): Promise<PriceListItemRecord | null> {
    if (!this.prisma) return this.updateItem(tenantId, id, p);
    const data: Prisma.PriceListItemRecordUpdateManyMutationInput = {
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
    };
    const r = await this.inTenant(tenantId, (tx) =>
      tx.priceListItemRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return r.count ? this.persistedItemById(tenantId, id) : null;
  }
  public async persistedSearchItems(
    tenantId: string,
    filters: PriceListItemSearchFilters & { priceListId?: string | undefined },
  ): Promise<{ items: PriceListItemRecord[]; total: number }> {
    if (!this.prisma) {
      const result = this.searchItems(tenantId, filters);
      const all = result.items.filter(
        (item) =>
          !filters.priceListId || item.priceListId === filters.priceListId,
      );
      return { items: all, total: all.length };
    }
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.priceListItemRecord.findMany({
        where: {
          tenantId,
          ...(filters.priceListId ? { priceListId: filters.priceListId } : {}),
          ...(filters.productId ? { productId: filters.productId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { supersedesId: "asc" }],
      }),
    );
    const all = rows
      .map((row) => this.mapItem(row))
      .filter(
        (rec) =>
          !filters.effectiveAt ||
          this.isItemEffectiveAt(rec, filters.effectiveAt),
      );
    return {
      items: all.slice(filters.offset, filters.offset + filters.limit),
      total: all.length,
    };
  }
  public async persistedActiveItemByProductInList(
    tenantId: string,
    priceListId: string,
    productId: string,
  ): Promise<PriceListItemRecord | null> {
    if (!this.prisma)
      return this.findActiveItemByProductInList(
        tenantId,
        priceListId,
        productId,
      );
    const row = await this.inTenant(tenantId, (tx) =>
      tx.priceListItemRecord.findFirst({
        where: { tenantId, priceListId, productId, status: "active" },
        orderBy: { createdAt: "desc" },
      }),
    );
    return row ? this.mapItem(row) : null;
  }

  public findItemById(
    tenantId: string,
    id: string,
  ): PriceListItemRecord | null {
    const rec = this.itemsById.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateItem(
    tenantId: string,
    id: string,
    patch: PriceListItemPatch,
  ): PriceListItemRecord | null {
    const rec = this.findItemById(tenantId, id);
    if (!rec) return null;
    const wasActive = rec.status === "active";
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    // İndeks güncelle (status değiştiyse).
    const isActive = rec.status === "active";
    if (wasActive && !isActive) {
      this.removeActiveItemForProduct(rec.tenantId, rec.productId, rec.id);
    } else if (!wasActive && isActive) {
      this.addActiveItemForProduct(rec.tenantId, rec.productId, rec.id);
    }
    this.itemsById.set(id, rec);
    return rec;
  }

  /**
   * Liste düzeyinde satır arama. `status` filtresi opsiyonel;
   * `effectiveAt` verilirse yalnızca o tarihte geçerli satırlar
   * döner.
   */
  public searchItems(
    tenantId: string,
    filters: PriceListItemSearchFilters,
  ): { items: PriceListItemRecord[]; total: number } {
    const all: PriceListItemRecord[] = [];
    for (const rec of this.itemsById.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.productId && rec.productId !== filters.productId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (
        filters.effectiveAt &&
        !this.isItemEffectiveAt(rec, filters.effectiveAt)
      )
        continue;
      all.push(rec);
    }
    // En yeni kayıt üstte; aynı timestamp'te supersedesId null önde.
    all.sort((a, b) => {
      const cmp = b.createdAt.localeCompare(a.createdAt);
      if (cmp !== 0) return cmp;
      if (a.supersedesId === null && b.supersedesId !== null) return -1;
      if (a.supersedesId !== null && b.supersedesId === null) return 1;
      return 0;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Bir ürün için tüm aktif satırları getirir (resolver için). */
  public findActiveItemsByProduct(
    tenantId: string,
    productId: string,
  ): PriceListItemRecord[] {
    const set = this.activeItemsByProduct.get(
      this.productKey(tenantId, productId),
    );
    if (!set) return [];
    const out: PriceListItemRecord[] = [];
    for (const id of set) {
      const rec = this.itemsById.get(id);
      if (rec) out.push(rec);
    }
    return out;
  }

  /** Liste düzeyinde tüm aktif satır sayısı (itemCount için). */
  public countActiveItemsForList(priceListId: string): number {
    const set = this.itemsByList.get(priceListId);
    if (!set) return 0;
    let n = 0;
    for (const id of set) {
      const rec = this.itemsById.get(id);
      if (rec && rec.status === "active") n++;
    }
    return n;
  }

  /** Liste düzeyinde tüm satır sayısı (arşiv dahil). */
  public countItemsForList(priceListId: string): number {
    return this.itemsByList.get(priceListId)?.size ?? 0;
  }

  /** Bir ürün için aynı listede aktif satır var mı (unique kontrol). */
  public findActiveItemByProductInList(
    tenantId: string,
    priceListId: string,
    productId: string,
  ): PriceListItemRecord | null {
    const set = this.itemsByList.get(priceListId);
    if (!set) return null;
    for (const id of set) {
      const rec = this.itemsById.get(id);
      if (
        rec &&
        rec.tenantId === tenantId &&
        rec.productId === productId &&
        rec.status === "active"
      )
        return rec;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.listsById.clear();
    this.itemsById.clear();
    this.itemsByList.clear();
    this.activeItemsByProduct.clear();
    this.listCounters.clear();
    this.itemCounters.clear();
  }

  public toListRecord(args: PriceListRecord): PriceListRecord {
    return { ...args };
  }

  public toItemRecord(args: PriceListItemRecord): PriceListItemRecord {
    return { ...args };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private isListEffectiveAt(rec: PriceListRecord, effectiveAt: Date): boolean {
    if (rec.status !== "active") return false;
    if (rec.archivedAt !== null) return false;
    if (
      rec.validFrom !== null &&
      new Date(rec.validFrom).getTime() > effectiveAt.getTime()
    )
      return false;
    if (
      rec.validUntil !== null &&
      new Date(rec.validUntil).getTime() < effectiveAt.getTime()
    )
      return false;
    return true;
  }

  private isItemEffectiveAt(
    rec: PriceListItemRecord,
    effectiveAt: Date,
  ): boolean {
    if (rec.status !== "active") return false;
    if (
      rec.validFrom !== null &&
      new Date(rec.validFrom).getTime() > effectiveAt.getTime()
    )
      return false;
    if (
      rec.validUntil !== null &&
      new Date(rec.validUntil).getTime() < effectiveAt.getTime()
    )
      return false;
    return true;
  }

  private addActiveItemForProduct(
    tenantId: string,
    productId: string,
    itemId: string,
  ): void {
    const key = this.productKey(tenantId, productId);
    let set = this.activeItemsByProduct.get(key);
    if (!set) {
      set = new Set();
      this.activeItemsByProduct.set(key, set);
    }
    set.add(itemId);
  }

  private removeActiveItemForProduct(
    tenantId: string,
    productId: string,
    itemId: string,
  ): void {
    const key = this.productKey(tenantId, productId);
    const set = this.activeItemsByProduct.get(key);
    if (set) set.delete(itemId);
  }

  private productKey(tenantId: string, productId: string): string {
    return `${tenantId}|${productId}`;
  }
  private mapList(row: DbList): PriceListRecord {
    return {
      ...row,
      type: row.type as PriceListRecord["type"],
      currency: row.currency as PriceListRecord["currency"],
      taxProfile: row.taxProfile as PriceListRecord["taxProfile"],
      status: row.status as PriceListRecord["status"],
      validFrom: row.validFrom?.toISOString() ?? null,
      validUntil: row.validUntil?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }
  private mapItem(row: DbItem): PriceListItemRecord {
    return {
      ...row,
      taxProfile: row.taxProfile as PriceListItemRecord["taxProfile"],
      status: row.status as PriceListItemRecord["status"],
      validFrom: row.validFrom?.toISOString() ?? null,
      validUntil: row.validUntil?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
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
}
