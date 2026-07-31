/**
 * @file Depo, raf ve lot (stok partisi) domain tipleri.
 * @module apps/api/common/inventory/inventory.types
 *
 * @description GOAL-061 (FAZ-6) depo, raf, lot ve SKT domain modeli.
 * Üç temel varlık:
 * - `WarehouseRecord` — fiziksel depo.
 * - `ShelfRecord` — depo içindeki raf.
 * - `StockLotRecord` — ürün lot/parti (SKT takibi).
 *
 * **Stok miktarı bu tablolarda TUTULMAZ.** Stok miktarı
 * StockMovement (GOAL-063+) ile hesaplanır; burada yalnızca
 * tanımlar tutulur.
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `Warehouse` / `Shelf` / `StockLot` tabloları ile
 * değiştirilecek (API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Fiziksel silme YOKTUR;
 *   arşivleme `archivedAt` alanı ile yapılır. SKT'si geçmiş
 *   lotlar arşivlenmeden de `active=false` yapılabilir; bu sayede
 *   audit trail korunur.
 *
 * @since GOAL-061 (FAZ-6) depo, raf, lot ve SKT core
 */

import type {
  Shelf,
  StockLot,
  Warehouse,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Warehouse (Depo)
 * -------------------------------------------------------------------------- */

export interface WarehouseRecord {
  id: string;
  tenantId: string;
  name: string;
  /** Tenant içinde benzersiz kısa kod (ÖR. "MAIN", "COLD-01"). */
  code: string;
  type: Warehouse["type"];
  address: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
}

export type { Warehouse };

/** Record → public Warehouse (API response). */
export function toWarehouse(rec: WarehouseRecord): Warehouse {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    name: rec.name,
    code: rec.code,
    type: rec.type,
    address: rec.address,
    notes: rec.notes,
    active: rec.active,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
    archivedAt: rec.archivedAt,
    archivedBy: rec.archivedBy,
    archiveReason: rec.archiveReason,
  };
}

/* --------------------------------------------------------------------------
 * Shelf (Raf)
 * -------------------------------------------------------------------------- */

export interface ShelfRecord {
  id: string;
  tenantId: string;
  warehouseId: string;
  name: string;
  /** Depo içinde benzersiz kısa kod. */
  code: string | null;
  temperatureZone: "room" | "cold" | "freezer";
  notes: string | null;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
}

export type { Shelf };

/** Record → public Shelf (API response). */
export function toShelf(rec: ShelfRecord): Shelf {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    warehouseId: rec.warehouseId,
    name: rec.name,
    code: rec.code,
    temperatureZone: rec.temperatureZone,
    notes: rec.notes,
    active: rec.active,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
    archivedAt: rec.archivedAt,
    archivedBy: rec.archivedBy,
    archiveReason: rec.archiveReason,
  };
}

/* --------------------------------------------------------------------------
 * StockLot (Lot / Stok Partisi)
 * -------------------------------------------------------------------------- */

export interface StockLotRecord {
  id: string;
  tenantId: string;
  /** Product.id referansı (GOAL-060). */
  productId: string;
  /** Tedarikçi/üretici lot numarası. */
  lotNumber: string;
  /** Son kullanma tarihi (ISO datetime). */
  expiryDate: string;
  /** Üretim tarihi (opsiyonel). */
  manufacturedAt: string | null;
  /** Teslim alındığı tarih (default: createdAt). */
  receivedAt: string;
  /** Tedarikçi adı (serbest metin). */
  supplierName: string | null;
  /** Raf ataması (opsiyonel; sonradan değiştirilebilir). */
  shelfId: string | null;
  /**
   * Başlangıç miktarı (Decimal string). Bu lot alındığında gelen
   * miktar; sonradan hareketlerle değişebilir. Stok miktarı
   * kesin kaynağı DEĞİLDİR; hareketlerden hesaplanır (GOAL-063+).
   */
  quantity: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
}

export type { StockLot };

/** Record → public StockLot (API response). */
export function toStockLot(rec: StockLotRecord): StockLot {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    productId: rec.productId,
    lotNumber: rec.lotNumber,
    expiryDate: rec.expiryDate,
    manufacturedAt: rec.manufacturedAt,
    receivedAt: rec.receivedAt,
    supplierName: rec.supplierName,
    shelfId: rec.shelfId,
    quantity: rec.quantity,
    notes: rec.notes,
    active: rec.active,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
    archivedAt: rec.archivedAt,
    archivedBy: rec.archivedBy,
    archiveReason: rec.archiveReason,
  };
}

/* --------------------------------------------------------------------------
 * Yardımcılar
 * -------------------------------------------------------------------------- */

/**
 * Decimal string'i normalize et (ürün modülü ile uyumlu).
 * `null` veya tanımsız girdi → null. Geçersiz format → null
 * (caller 422 VET-VALIDATION-0010 fırlatır).
 */
export function normalizeLotQuantity(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return null;
  const parts = value.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = parts[1];
  const normalizedInt =
    intPart.length > 1 ? intPart.replace(/^0+(?=\d)/, "") : intPart;
  return fracPart !== undefined
    ? `${normalizedInt}.${fracPart}`
    : normalizedInt;
}

/**
 * SKT'nin geçmiş olup olmadığını kontrol et. Karşılaştırma
 * UTC saniye düzeyinde yapılır. SKT zamanı şu andan küçükse
 * geçmiş sayılır.
 */
export function isExpired(expiryDate: string, now: Date = new Date()): boolean {
  const t = Date.parse(expiryDate);
  if (Number.isNaN(t)) return false;
  return t < now.getTime();
}
