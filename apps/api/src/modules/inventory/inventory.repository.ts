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

import { Injectable, Optional } from "@nestjs/common";
import type { Prisma, WarehouseRecord as DbWarehouse } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

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
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  // -------------------------------------------------------------------------
  // Warehouse
  // -------------------------------------------------------------------------

  public nextWarehouseId(tenantId: string): string {
    if (this.prisma) return `wh-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.warehouseCounters.get(tenantId) ?? 0) + 1;
    this.warehouseCounters.set(tenantId, n);
    return `wh-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  /** Depo kaydını tenant RLS bağlamında kalıcılaştırır. */
  public async persistWarehouse(
    record: WarehouseRecord,
  ): Promise<WarehouseRecord> {
    if (!this.prisma) return this.insertWarehouse(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.warehouseRecord.create({
        data: {
          ...record,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
          archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
        },
      }),
    );
    this.insertWarehouse(record);
    return this.mapWarehouse(row);
  }
  public async persistedWarehouseById(
    tenantId: string,
    id: string,
  ): Promise<WarehouseRecord | null> {
    if (!this.prisma) return this.findWarehouseById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.warehouseRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapWarehouse(row) : null;
  }
  public async persistedWarehouseByCode(
    tenantId: string,
    code: string,
  ): Promise<WarehouseRecord | null> {
    if (!this.prisma) return this.findWarehouseByCode(tenantId, code);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.warehouseRecord.findFirst({ where: { tenantId, code } }),
    );
    return row ? this.mapWarehouse(row) : null;
  }
  public async persistedWarehouseSearch(
    tenantId: string,
    f: WarehouseSearchFilters,
  ): Promise<{ items: WarehouseRecord[]; total: number }> {
    if (!this.prisma) return this.searchWarehouses(tenantId, f);
    const where: Prisma.WarehouseRecordWhereInput = {
      tenantId,
      ...(f.includeArchived ? {} : { archivedAt: null }),
      ...(f.type ? { type: f.type } : {}),
      ...(f.active !== undefined ? { active: f.active } : {}),
      ...(f.search
        ? {
            OR: [
              { name: { contains: f.search, mode: "insensitive" } },
              { code: { contains: f.search, mode: "insensitive" } },
              { address: { contains: f.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.inTenant(tenantId, (tx) =>
      Promise.all([
        tx.warehouseRecord.findMany({
          where,
          orderBy: { code: "asc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.warehouseRecord.count({ where }),
      ]),
    );
    return { items: rows.map((r) => this.mapWarehouse(r)), total };
  }
  public async persistedWarehouseUpdate(
    tenantId: string,
    id: string,
    patch: WarehousePatch,
  ): Promise<WarehouseRecord | null> {
    if (!this.prisma) return this.updateWarehouse(tenantId, id, patch);
    const data: Prisma.WarehouseRecordUpdateManyMutationInput = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.code !== undefined ? { code: patch.code } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
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
    const count = await this.inTenant(tenantId, (tx) =>
      tx.warehouseRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return count.count ? this.persistedWarehouseById(tenantId, id) : null;
  }
  public async persistedActiveShelvesForWarehouse(
    tenantId: string,
    warehouseId: string,
  ): Promise<number> {
    if (!this.prisma)
      return this.countActiveShelvesForWarehouse(tenantId, warehouseId);
    return this.inTenant(tenantId, (tx) =>
      tx.shelfRecord.count({
        where: { tenantId, warehouseId, archivedAt: null },
      }),
    );
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
      this.warehousesByCode.delete(this.tenantCodeKey(rec.tenantId, rec.code));
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
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  // -------------------------------------------------------------------------
  // Shelf
  // -------------------------------------------------------------------------

  public nextShelfId(tenantId: string): string {
    if (this.prisma) return `shf-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.shelfCounters.get(tenantId) ?? 0) + 1;
    this.shelfCounters.set(tenantId, n);
    return `shf-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  /** Raf kaydını tenant RLS bağlamında kalıcılaştırır. */
  public async persistShelf(record: ShelfRecord): Promise<ShelfRecord> {
    if (!this.prisma) return this.insertShelf(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.shelfRecord.create({
        data: {
          ...record,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
          archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
        },
      }),
    );
    this.insertShelf(record);
    return this.mapShelf(row);
  }
  public async persistedShelfById(
    tenantId: string,
    id: string,
  ): Promise<ShelfRecord | null> {
    if (!this.prisma) return this.findShelfById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.shelfRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapShelf(row) : null;
  }
  public async persistedShelfByCode(
    tenantId: string,
    warehouseId: string,
    code: string,
  ): Promise<ShelfRecord | null> {
    if (!this.prisma) return this.findShelfByCode(tenantId, warehouseId, code);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.shelfRecord.findFirst({ where: { tenantId, warehouseId, code } }),
    );
    return row ? this.mapShelf(row) : null;
  }
  public async persistedShelfSearch(
    tenantId: string,
    f: ShelfSearchFilters,
  ): Promise<{ items: ShelfRecord[]; total: number }> {
    if (!this.prisma) return this.searchShelves(tenantId, f);
    const where: Prisma.ShelfRecordWhereInput = {
      tenantId,
      ...(f.includeArchived ? {} : { archivedAt: null }),
      ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
      ...(f.temperatureZone ? { temperatureZone: f.temperatureZone } : {}),
      ...(f.active !== undefined ? { active: f.active } : {}),
      ...(f.search
        ? {
            OR: [
              { name: { contains: f.search, mode: "insensitive" } },
              { code: { contains: f.search, mode: "insensitive" } },
              { notes: { contains: f.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.inTenant(tenantId, (tx) =>
      Promise.all([
        tx.shelfRecord.findMany({
          where,
          orderBy: { name: "asc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.shelfRecord.count({ where }),
      ]),
    );
    return { items: rows.map((r) => this.mapShelf(r)), total };
  }
  public async persistedShelfUpdate(
    tenantId: string,
    id: string,
    p: ShelfPatch,
  ): Promise<ShelfRecord | null> {
    if (!this.prisma) return this.updateShelf(tenantId, id, p);
    const data: Prisma.ShelfRecordUpdateManyMutationInput = {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.code !== undefined ? { code: p.code } : {}),
      ...(p.temperatureZone !== undefined
        ? { temperatureZone: p.temperatureZone }
        : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.active !== undefined ? { active: p.active } : {}),
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
    const result = await this.inTenant(tenantId, (tx) =>
      tx.shelfRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return result.count ? this.persistedShelfById(tenantId, id) : null;
  }
  public async persistedActiveLotsForShelf(
    tenantId: string,
    shelfId: string,
  ): Promise<number> {
    if (!this.prisma) return this.countActiveLotsForShelf(tenantId, shelfId);
    return this.inTenant(tenantId, (tx) =>
      tx.stockLotRecord.count({
        where: { tenantId, shelfId, archivedAt: null },
      }),
    );
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

  public findShelfById(tenantId: string, id: string): ShelfRecord | null {
    const rec = this.shelvesById.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findShelfByCode(
    tenantId: string,
    warehouseId: string,
    code: string,
  ): ShelfRecord | null {
    const id = this.shelvesByCode.get(this.warehouseCodeKey(warehouseId, code));
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
      if (filters.warehouseId && rec.warehouseId !== filters.warehouseId)
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
    const items = all.slice(filters.offset, filters.offset + filters.limit);
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
    if (this.prisma) return `lot-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.lotCounters.get(tenantId) ?? 0) + 1;
    this.lotCounters.set(tenantId, n);
    return `lot-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  /** Lot kaydını tenant RLS bağlamında kalıcılaştırır. */
  public async persistLot(record: StockLotRecord): Promise<StockLotRecord> {
    if (!this.prisma) return this.insertLot(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.stockLotRecord.create({
        data: {
          ...record,
          expiryDate: new Date(record.expiryDate),
          manufacturedAt: record.manufacturedAt
            ? new Date(record.manufacturedAt)
            : null,
          receivedAt: new Date(record.receivedAt),
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
          archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
        },
      }),
    );
    this.insertLot(record);
    return this.mapLot(row);
  }
  public async persistedLotById(
    tenantId: string,
    id: string,
  ): Promise<StockLotRecord | null> {
    if (!this.prisma) return this.findLotById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.stockLotRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapLot(row) : null;
  }
  public async persistedLotByProductAndNumber(
    tenantId: string,
    productId: string,
    lotNumber: string,
  ): Promise<StockLotRecord | null> {
    if (!this.prisma)
      return this.findLotByProductAndNumber(tenantId, productId, lotNumber);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.stockLotRecord.findFirst({
        where: { tenantId, productId, lotNumber },
      }),
    );
    return row ? this.mapLot(row) : null;
  }
  public async persistedLotSearch(
    tenantId: string,
    f: StockLotSearchFilters,
  ): Promise<{ items: StockLotRecord[]; total: number }> {
    if (!this.prisma) return this.searchLots(tenantId, f);
    const where: Prisma.StockLotRecordWhereInput = {
      tenantId,
      ...(f.includeArchived ? {} : { archivedAt: null }),
      ...(f.productId ? { productId: f.productId } : {}),
      ...(f.shelfId ? { shelfId: f.shelfId } : {}),
      ...(f.warehouseId ? { shelf: { warehouseId: f.warehouseId } } : {}),
      ...(f.expiresBefore
        ? { expiryDate: { lte: new Date(f.expiresBefore) } }
        : {}),
      ...(f.expiresAfter
        ? { expiryDate: { gte: new Date(f.expiresAfter) } }
        : {}),
      ...(f.expiredOnly === true ? { expiryDate: { lt: new Date() } } : {}),
      ...(f.expiredOnly === false ? { expiryDate: { gte: new Date() } } : {}),
      ...(f.supplierName ? { supplierName: f.supplierName } : {}),
      ...(f.lotNumber ? { lotNumber: f.lotNumber } : {}),
      ...(f.active !== undefined ? { active: f.active } : {}),
      ...(f.search
        ? {
            OR: [
              { lotNumber: { contains: f.search, mode: "insensitive" } },
              { productId: { contains: f.search, mode: "insensitive" } },
              { supplierName: { contains: f.search, mode: "insensitive" } },
              { notes: { contains: f.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.inTenant(tenantId, (tx) =>
      Promise.all([
        tx.stockLotRecord.findMany({
          where,
          orderBy: { expiryDate: "asc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.stockLotRecord.count({ where }),
      ]),
    );
    return { items: rows.map((r) => this.mapLot(r)), total };
  }
  public async persistedLotUpdate(
    tenantId: string,
    id: string,
    p: StockLotPatch,
  ): Promise<StockLotRecord | null> {
    if (!this.prisma) return this.updateLot(tenantId, id, p);
    const data: Prisma.StockLotRecordUpdateManyMutationInput = {
      ...(p.lotNumber !== undefined ? { lotNumber: p.lotNumber } : {}),
      ...(p.expiryDate !== undefined
        ? { expiryDate: new Date(p.expiryDate) }
        : {}),
      ...(p.manufacturedAt !== undefined
        ? {
            manufacturedAt: p.manufacturedAt
              ? new Date(p.manufacturedAt)
              : null,
          }
        : {}),
      ...(p.receivedAt !== undefined
        ? { receivedAt: new Date(p.receivedAt) }
        : {}),
      ...(p.supplierName !== undefined ? { supplierName: p.supplierName } : {}),
      ...(p.shelfId !== undefined ? { shelfId: p.shelfId } : {}),
      ...(p.quantity !== undefined ? { quantity: p.quantity } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.active !== undefined ? { active: p.active } : {}),
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
    const result = await this.inTenant(tenantId, (tx) =>
      tx.stockLotRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return result.count ? this.persistedLotById(tenantId, id) : null;
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

  public findLotById(tenantId: string, id: string): StockLotRecord | null {
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
    if (patch.lotNumber !== undefined && patch.lotNumber !== rec.lotNumber) {
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
      if (filters.supplierName && rec.supplierName !== filters.supplierName)
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
  public countActiveLotsForShelf(tenantId: string, shelfId: string): number {
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

  private mapWarehouse(row: DbWarehouse): WarehouseRecord {
    return {
      ...row,
      type: row.type as WarehouseRecord["type"],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }
  private mapShelf(row: {
    id: string;
    tenantId: string;
    warehouseId: string;
    name: string;
    code: string | null;
    temperatureZone: string;
    notes: string | null;
    active: boolean;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    archivedAt: Date | null;
    archivedBy: string | null;
    archiveReason: string | null;
  }): ShelfRecord {
    return {
      ...row,
      temperatureZone: row.temperatureZone as ShelfRecord["temperatureZone"],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }
  private mapLot(row: {
    id: string;
    tenantId: string;
    productId: string;
    lotNumber: string;
    expiryDate: Date;
    manufacturedAt: Date | null;
    receivedAt: Date;
    supplierName: string | null;
    shelfId: string | null;
    quantity: string | null;
    notes: string | null;
    active: boolean;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    archivedAt: Date | null;
    archivedBy: string | null;
    archiveReason: string | null;
  }): StockLotRecord {
    return {
      ...row,
      expiryDate: row.expiryDate.toISOString(),
      manufacturedAt: row.manufacturedAt?.toISOString() ?? null,
      receivedAt: row.receivedAt.toISOString(),
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
}
