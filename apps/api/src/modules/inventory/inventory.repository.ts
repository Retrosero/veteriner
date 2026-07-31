/**
 * @file Inventory (depo/raf/lot) repository (in-memory).
 * @module apps/api/modules/inventory/inventory.repository
 *
 * @description GOAL-061 depo, raf, lot ve SKT veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map'ler
 * kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Üç ayrı kayıt seti:
 * - `byId` (warehouses) — id → record.
 * - `byCode` (warehouses) — tenantId|code → record id (unique).
 * - `byId` (shelves) — id → record.
 * - `byCode` (shelves) — warehouseId|code → record id (unique per warehouse).
 * - `byWarehouse` (shelves) — warehouseId → Set<shelfId> (index).
 * - `byId` (lots) — id → record.
 * - `byProductLot` (lots) — productId|lotNumber → record id (unique per product).
 * - `byShelf` (lots) — shelfId → Set<lotId> (index).
 * - `byProduct` (lots) — productId → Set<lotId> (index).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-061 (FAZ-6) depo, raf, lot ve SKT core
 */

import { Injectable } from "@nestjs/common";

import type {
  ShelfRecord,
  StockLotRecord,
  WarehouseRecord,
} from "../../common/inventory/inventory.types.js";

/* --------------------------------------------------------------------------
 * Warehouse (Depo)
 * -------------------------------------------------------------------------- */

/** Warehouse kısmi güncelleme patch. */
export interface WarehousePatch {
  name?: string | undefined;
  code?: string | undefined;
  type?: WarehouseRecord["type"] | undefined;
  address?: string | null | undefined;
  notes?: string | null | undefined;
  active?: boolean | undefined;
  updatedAt?: string | undefined;
  archivedAt?: string | null | undefined;
  archivedBy?: string | null | undefined;
  archiveReason?: string | null | undefined;
}

/** Warehouse arama filtreleri. */
export interface WarehouseSearchFilters {
  type?: WarehouseRecord["type"] | undefined;
  active?: boolean | undefined;
  search?: string | undefined;
  includeArchived?: boolean | undefined;
  limit: number;
  offset: number;
}

/* --------------------------------------------------------------------------
 * Shelf (Raf)
 * -------------------------------------------------------------------------- */

/** Shelf kısmi güncelleme patch. */
export interface ShelfPatch {
  name?: string | undefined;
  code?: string | null | undefined;
  temperatureZone?: ShelfRecord["temperatureZone"] | undefined;
  notes?: string | null | undefined;
  active?: boolean | undefined;
  updatedAt?: string | undefined;
  archivedAt?: string | null | undefined;
  archivedBy?: string | null | undefined;
  archiveReason?: string | null | undefined;
}

/** Shelf arama filtreleri. */
export interface ShelfSearchFilters {
  warehouseId?: string | undefined;
  temperatureZone?: ShelfRecord["temperatureZone"] | undefined;
  active?: boolean | undefined;
  search?: string | undefined;
  includeArchived?: boolean | undefined;
  limit: number;
  offset: number;
}

/* --------------------------------------------------------------------------
 * StockLot (Lot / Stok Partisi)
 * -------------------------------------------------------------------------- */

/** Lot kısmi güncelleme patch. */
export interface StockLotPatch {
  lotNumber?: string | undefined;
  expiryDate?: string | undefined;
  manufacturedAt?: string | null | undefined;
  receivedAt?: string | undefined;
  supplierName?: string | null | undefined;
  shelfId?: string | null | undefined;
  quantity?: string | null | undefined;
  notes?: string | null | undefined;
  active?: boolean | undefined;
  updatedAt?: string | undefined;
  archivedAt?: string | null | undefined;
  archivedBy?: string | null | undefined;
  archiveReason?: string | null | undefined;
}

/** Lot arama filtreleri. */
export interface StockLotSearchFilters {
  productId?: string | undefined;
  shelfId?: string | undefined;
  warehouseId?: string | undefined;
  expiresBefore?: string | undefined;
  expiresAfter?: string | undefined;
  expiredOnly?: boolean | undefined;
  supplierName?: string | undefined;
  lotNumber?: string | undefined;
  active?: boolean | undefined;
  search?: string | undefined;
  includeArchived?: boolean | undefined;
  limit: number;
  offset: number;
}

/* --------------------------------------------------------------------------
 * Repository
 * -------------------------------------------------------------------------- */

@Injectable()
export class InventoryRepository {
  /** Warehouses: id → record. */
  private readonly warehousesById = new Map<string, WarehouseRecord>();
  /** Warehouses: tenantId|code → record id (unique per tenant). */
  private readonly warehousesByCode = new Map<string, string>();
  /** Warehouse counter. */
  private readonly warehouseCounters = new Map<string, number>();

  /** Shelves: id → record. */
  private readonly shelvesById = new Map<string, ShelfRecord>();
  /** Shelves: warehouseId|code → record id (unique per warehouse). */
  private readonly shelvesByCode = new Map<string, string>();
  /** Shelves: warehouseId → Set<shelfId>. */
  private readonly shelvesByWarehouse = new Map<string, Set<string>>();
  /** Shelf counter. */
  private readonly shelfCounters = new Map<string, number>();

  /** Lots: id → record. */
  private readonly lotsById = new Map<string, StockLotRecord>();
  /** Lots: productId|lotNumber → record id (unique per product). */
  private readonly lotsByProductLot = new Map<string, string>();
  /** Lots: shelfId → Set<lotId>. */
  private readonly lotsByShelf = new Map<string, Set<string>>();
  /** Lots: productId → Set<lotId>. */
  private readonly lotsByProduct = new Map<string, Set<string>>();
  /** Lot counter. */
  private readonly lotCounters = new Map<string, number>();

  // -------------------------------------------------------------------------
  // Warehouse
  // -------------------------------------------------------------------------

  public nextWarehouseId(tenantId: string): string {
    const n = (this.warehouseCounters.get(tenantId) ?? 0) + 1;
    this.warehouseCounters.set(tenantId, n);
    return `wh-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insertWarehouse(record: WarehouseRecord): WarehouseRecord {
    this.warehousesById.set(record.id, record);
    this.warehousesByCode.set(
      this.tenantCodeKey(record.tenantId, record.code),
      record.id,
    );
    return record;
  }

  public findWarehouseById(
    tenantId: string,
    id: string,
  ): WarehouseRecord | null {
    const rec = this.warehousesById.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findWarehouseByCode(
    tenantId: string,
    code: string,
  ): WarehouseRecord | null {
    const id = this.warehousesByCode.get(this.tenantCodeKey(tenantId, code));
    if (!id) return null;
    const rec = this.warehousesById.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateWarehouse(
    tenantId: string,
    id: string,
    patch: WarehousePatch,
  ): WarehouseRecord | null {
    const rec = this.findWarehouseById(tenantId, id);
    if (!rec) return null;
    if (patch.code !== undefined && patch.code !== rec.code) {
      this.warehousesByCode.delete(
        this.tenantCodeKey(rec.tenantId, rec.code),
      );
      this.warehousesByCode.set(
        this.tenantCodeKey(rec.tenantId, patch.code),
        rec.id,
      );
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.warehousesById.set(id, rec);
    return rec;
  }

  public searchWarehouses(
    tenantId: string,
    filters: WarehouseSearchFilters,
  ): { items: WarehouseRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();
    const all: WarehouseRecord[] = [];
    for (const rec of this.warehousesById.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (!filters.includeArchived && rec.archivedAt !== null) continue;
      if (filters.type && rec.type !== filters.type) continue;
      if (filters.active !== undefined && rec.active !== filters.active)
        continue;
      if (needle) {
        const hay = [rec.name, rec.code, rec.address ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      all.push(rec);
    }
    all.sort((a, b) => a.code.localeCompare(b.code));
    const total = all.length;
    const items = all.slice(
      filters.offset,
      filters.offset + filters.limit,
    );
    return { items, total };
  }

  // -------------------------------------------------------------------------
  // Shelf
  // -------------------------------------------------------------------------

  public nextShelfId(tenantId: string): string {
    const n = (this.shelfCounters.get(tenantId) ?? 0) + 1;
    this.shelfCounters.set(tenantId, n);
    return `shf-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insertShelf(record: ShelfRecord): ShelfRecord {
    this.shelvesById.set(record.id, record);
    if (record.code !== null) {
      this.shelvesByCode.set(
        this.warehouseCodeKey(record.warehouseId, record.code),
        record.id,
      );
    }
    let set = this.shelvesByWarehouse.get(record.warehouseId);
    if (!set) {
      set = new Set();
      this.shelvesByWarehouse.set(record.warehouseId, set);
    }
    set.add(record.id);
    return record;
  }

  public findShelfById(
    tenantId: string,
    id: string,
  ): ShelfRecord | null {
    const rec = this.shelvesById.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findShelfByCode(
    tenantId: string,
    warehouseId: string,
    code: string,
  ): ShelfRecord | null {
    const id = this.shelvesByCode.get(
      this.warehouseCodeKey(warehouseId, code),
    );
    if (!id) return null;
    const rec = this.shelvesById.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateShelf(
    tenantId: string,
    id: string,
    patch: ShelfPatch,
  ): ShelfRecord | null {
    const rec = this.findShelfById(tenantId, id);
    if (!rec) return null;
    if (patch.code !== undefined && patch.code !== rec.code) {
      if (rec.code !== null) {
        this.shelvesByCode.delete(
          this.warehouseCodeKey(rec.warehouseId, rec.code),
        );
      }
      if (patch.code !== null) {
        this.shelvesByCode.set(
          this.warehouseCodeKey(rec.warehouseId, patch.code),
          rec.id,
        );
      }
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.shelvesById.set(id, rec);
    return rec;
  }

  public searchShelves(
    tenantId: string,
    filters: ShelfSearchFilters,
  ): { items: ShelfRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();
    const all: ShelfRecord[] = [];
    for (const rec of this.shelvesById.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (!filters.includeArchived && rec.archivedAt !== null) continue;
      if (
        filters.warehouseId &&
        rec.warehouseId !== filters.warehouseId
      )
        continue;
      if (
        filters.temperatureZone &&
        rec.temperatureZone !== filters.temperatureZone
      )
        continue;
      if (filters.active !== undefined && rec.active !== filters.active)
        continue;
      if (needle) {
        const hay = [rec.name, rec.code ?? "", rec.notes ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      all.push(rec);
    }
    all.sort((a, b) => a.name.localeCompare(b.name));
    const total = all.length;
    const items = all.slice(
      filters.offset,
      filters.offset + filters.limit,
    );
    return { items, total };
  }

  /**
   * Depoya bağlı aktif raf sayısı (arşivlenmemiş). Arşivleme
   * engellemesi için kullanılır: depoda raf varsa arşivlenemez.
   */
  public countActiveShelvesForWarehouse(
    tenantId: string,
    warehouseId: string,
  ): number {
    const set = this.shelvesByWarehouse.get(warehouseId);
    if (!set) return 0;
    let n = 0;
    for (const id of set) {
      const rec = this.shelvesById.get(id);
      if (!rec) continue;
      if (rec.tenantId !== tenantId) continue;
      if (rec.archivedAt !== null) continue;
      n += 1;
    }
    return n;
  }

  // -------------------------------------------------------------------------
  // StockLot
  // -------------------------------------------------------------------------

  public nextLotId(tenantId: string): string {
    const n = (this.lotCounters.get(tenantId) ?? 0) + 1;
    this.lotCounters.set(tenantId, n);
    return `lot-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insertLot(record: StockLotRecord): StockLotRecord {
    this.lotsById.set(record.id, record);
    this.lotsByProductLot.set(
      this.productLotKey(record.productId, record.lotNumber),
      record.id,
    );
    this.addToProductIndex(record.productId, record.id);
    if (record.shelfId !== null) {
      this.addToShelfIndex(record.shelfId, record.id);
    }
    return record;
  }

  public findLotById(
    tenantId: string,
    id: string,
  ): StockLotRecord | null {
    const rec = this.lotsById.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findLotByProductAndNumber(
    tenantId: string,
    productId: string,
    lotNumber: string,
  ): StockLotRecord | null {
    const id = this.lotsByProductLot.get(
      this.productLotKey(productId, lotNumber),
    );
    if (!id) return null;
    const rec = this.lotsById.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateLot(
    tenantId: string,
    id: string,
    patch: StockLotPatch,
  ): StockLotRecord | null {
    const rec = this.findLotById(tenantId, id);
    if (!rec) return null;
    if (
      patch.lotNumber !== undefined &&
      patch.lotNumber !== rec.lotNumber
    ) {
      this.lotsByProductLot.delete(
        this.productLotKey(rec.productId, rec.lotNumber),
      );
      this.lotsByProductLot.set(
        this.productLotKey(rec.productId, patch.lotNumber),
        rec.id,
      );
    }
    if (patch.shelfId !== undefined && patch.shelfId !== rec.shelfId) {
      if (rec.shelfId !== null) {
        this.removeFromShelfIndex(rec.shelfId, rec.id);
      }
      if (patch.shelfId !== null) {
        this.addToShelfIndex(patch.shelfId, rec.id);
      }
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.lotsById.set(id, rec);
    return rec;
  }

  public searchLots(
    tenantId: string,
    filters: StockLotSearchFilters,
  ): { items: StockLotRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();
    const expiresBeforeMs =
      filters.expiresBefore !== undefined
        ? Date.parse(filters.expiresBefore)
        : undefined;
    const expiresAfterMs =
      filters.expiresAfter !== undefined
        ? Date.parse(filters.expiresAfter)
        : undefined;
    const all: StockLotRecord[] = [];
    for (const rec of this.lotsById.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (!filters.includeArchived && rec.archivedAt !== null) continue;
      if (filters.productId && rec.productId !== filters.productId) continue;
      if (filters.shelfId && rec.shelfId !== filters.shelfId) continue;
      if (filters.lotNumber && rec.lotNumber !== filters.lotNumber) continue;
      if (
        filters.supplierName &&
        rec.supplierName !== filters.supplierName
      )
        continue;
      if (filters.active !== undefined && rec.active !== filters.active)
        continue;
      const expMs = Date.parse(rec.expiryDate);
      if (
        expiresBeforeMs !== undefined &&
        !Number.isNaN(expMs) &&
        expMs > expiresBeforeMs
      )
        continue;
      if (
        expiresAfterMs !== undefined &&
        !Number.isNaN(expMs) &&
        expMs < expiresAfterMs
      )
        continue;
      if (filters.expiredOnly !== undefined) {
        const expired = !Number.isNaN(expMs) && expMs < Date.now();
        if (filters.expiredOnly && !expired) continue;
        if (!filters.expiredOnly && expired) continue;
      }
      if (needle) {
        const hay = [
          rec.lotNumber,
          rec.productId,
          rec.supplierName ?? "",
          rec.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      all.push(rec);
    }
    // SKT yaklaşan en önce; geçmiş en sonda.
    all.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    let total = all.length;
    let items = all;
    if (filters.warehouseId) {
      const filtered = all.filter((lot) => {
        if (lot.shelfId === null) return false;
        const shelf = this.shelvesById.get(lot.shelfId);
        return shelf?.warehouseId === filters.warehouseId;
      });
      total = filtered.length;
      items = filtered;
    }
    return {
      items: items.slice(filters.offset, filters.offset + filters.limit),
      total,
    };
  }

  /**
   * Belirli bir raftaki aktif lot sayısı (arşivlenmemiş). Raf
   * arşivleme engellemesi için kullanılır: rafta lot varsa
   * arşivlenemez.
   */
  public countActiveLotsForShelf(
    tenantId: string,
    shelfId: string,
  ): number {
    const set = this.lotsByShelf.get(shelfId);
    if (!set) return 0;
    let n = 0;
    for (const id of set) {
      const rec = this.lotsById.get(id);
      if (!rec) continue;
      if (rec.tenantId !== tenantId) continue;
      if (rec.archivedAt !== null) continue;
      n += 1;
    }
    return n;
  }

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.warehousesById.clear();
    this.warehousesByCode.clear();
    this.warehouseCounters.clear();
    this.shelvesById.clear();
    this.shelvesByCode.clear();
    this.shelvesByWarehouse.clear();
    this.shelfCounters.clear();
    this.lotsById.clear();
    this.lotsByProductLot.clear();
    this.lotsByShelf.clear();
    this.lotsByProduct.clear();
    this.lotCounters.clear();
  }

  // -------------------------------------------------------------------------
  // Index yardımcıları
  // -------------------------------------------------------------------------

  private tenantCodeKey(tenantId: string, code: string): string {
    return `${tenantId}|${code}`;
  }

  private warehouseCodeKey(warehouseId: string, code: string): string {
    return `${warehouseId}|${code}`;
  }

  private productLotKey(productId: string, lotNumber: string): string {
    return `${productId}|${lotNumber}`;
  }

  private addToProductIndex(productId: string, lotId: string): void {
    let set = this.lotsByProduct.get(productId);
    if (!set) {
      set = new Set();
      this.lotsByProduct.set(productId, set);
    }
    set.add(lotId);
  }

  private addToShelfIndex(shelfId: string, lotId: string): void {
    let set = this.lotsByShelf.get(shelfId);
    if (!set) {
      set = new Set();
      this.lotsByShelf.set(shelfId, set);
    }
    set.add(lotId);
  }

  private removeFromShelfIndex(shelfId: string, lotId: string): void {
    const set = this.lotsByShelf.get(shelfId);
    if (set) set.delete(lotId);
  }
}
