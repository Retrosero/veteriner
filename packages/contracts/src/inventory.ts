/**
 * @file Depo, raf ve lot (stok partisi) API sözleşmesi.
 * @module @vetniva/contracts/inventory
 *
 * @description GOAL-061 (FAZ-6) depo, raf, lot ve son kullanma tarihi
 * (SKT) yönetimi için Zod şemaları + tipler. Backend (request/response
 * doğrulama) ve frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Üç temel kavram:
 * - `Warehouse` (depo): fiziksel konum. Pilot tek şube olsa da
 *   tenant başına birden fazla depo desteklenir (merkez depo, şube
 *   deposu vb.).
 * - `Shelf` (raf): depo içindeki konum. Ürün/lot yerleşimi için.
 * - `StockLot` (lot/stok partisi): bir ürün için tedarik edilen
 *   partinin takibi. Lot numarası + son kullanma tarihi (SKT) +
 *   tedarikçi/lot bilgisi.
 *
 * **Stok miktarı bu tabloda TUTULMAZ.** Stok miktarı hareketlerden
 * (StockMovement) hesaplanır; bu tablo yalnızca lot/raf/depo
 * tanımlarını tutar (lokasyon + partiler). Faz 6 ilerleyen
 * goal'larında (GOAL-061+) stok hareketleri ve sayım modülü
 * eklenecek.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip. Tenant
 *   bilgisi sözleşmede taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-061 (FAZ-6) depo, raf, lot ve SKT core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Depo (Warehouse)
 * -------------------------------------------------------------------------- */

/** Depo türü: klinik (ilaç/aşı saklama) veya petshop (genel stok). */
export const warehouseTypeSchema = z.enum(["clinic", "petshop", "general"]);
export type WarehouseType = z.infer<typeof warehouseTypeSchema>;

/**
 * Yeni depo oluşturma isteği.
 * - `name` zorunlu (görünen ad).
 * - `code` zorunlu (kısa kod; tenant içinde benzersiz).
 * - `type` zorunlu (varsayılan: general).
 * - `address` opsiyonel (serbest metin; ileride adres standardı
 *   eklenebilir).
 * - `notes` opsiyonel.
 */
export const warehouseCreateInputSchema = z.object({
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Yalnızca harf, rakam, tire ve alt çizgi"),
  type: warehouseTypeSchema.optional().default("general"),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
export type WarehouseCreateInput = z.infer<typeof warehouseCreateInputSchema>;

/** Depo kısmi güncelleme isteği. `code` değiştirilebilir. */
export const warehouseUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    code: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    type: warehouseTypeSchema.optional(),
    address: z.string().max(500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateInputSchema>;

/** API response şeması. */
export const warehouseSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  type: warehouseTypeSchema,
  address: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  archivedBy: z.string().nullable(),
  archiveReason: z.string().nullable(),
});
export type Warehouse = z.infer<typeof warehouseSchema>;

/** Depo liste filtreleri. */
export const warehouseFiltersSchema = z.object({
  type: warehouseTypeSchema.optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type WarehouseFilters = z.infer<typeof warehouseFiltersSchema>;

/** Liste response şeması. */
export const warehouseListResponseSchema = z.object({
  items: z.array(warehouseSchema),
  total: z.number().int().nonnegative(),
});
export type WarehouseListResponse = z.infer<typeof warehouseListResponseSchema>;

/** Arşivleme isteği. */
export const warehouseArchiveInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type WarehouseArchiveInput = z.infer<typeof warehouseArchiveInputSchema>;

/* --------------------------------------------------------------------------
 * Raf (Shelf)
 * -------------------------------------------------------------------------- */

/**
 * Yeni raf oluşturma isteği.
 * - `warehouseId` zorunlu.
 * - `name` zorunlu (görünen ad; ör. "Soğuk Oda / Raf A").
 * - `code` opsiyonel (kısa kod; depo içinde benzersiz).
 * - `temperatureZone` opsiyonel (room/cold/freezer).
 * - `notes` opsiyonel.
 */
export const shelfCreateInputSchema = z.object({
  warehouseId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  temperatureZone: z
    .enum(["room", "cold", "freezer"])
    .optional()
    .default("room"),
  notes: z.string().max(2000).optional(),
});
export type ShelfCreateInput = z.infer<typeof shelfCreateInputSchema>;

/** Raf kısmi güncelleme isteği. */
export const shelfUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    code: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/)
      .nullable()
      .optional(),
    temperatureZone: z.enum(["room", "cold", "freezer"]).optional(),
    notes: z.string().max(2000).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type ShelfUpdateInput = z.infer<typeof shelfUpdateInputSchema>;

/** API response şeması. */
export const shelfSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  warehouseId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  temperatureZone: z.enum(["room", "cold", "freezer"]),
  notes: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  archivedBy: z.string().nullable(),
  archiveReason: z.string().nullable(),
});
export type Shelf = z.infer<typeof shelfSchema>;

/** Raf liste filtreleri. */
export const shelfFiltersSchema = z.object({
  warehouseId: z.string().optional(),
  temperatureZone: z.enum(["room", "cold", "freezer"]).optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ShelfFilters = z.infer<typeof shelfFiltersSchema>;

/** Liste response şeması. */
export const shelfListResponseSchema = z.object({
  items: z.array(shelfSchema),
  total: z.number().int().nonnegative(),
});
export type ShelfListResponse = z.infer<typeof shelfListResponseSchema>;

/** Raf arşivleme isteği. */
export const shelfArchiveInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type ShelfArchiveInput = z.infer<typeof shelfArchiveInputSchema>;

/* --------------------------------------------------------------------------
 * Lot (StockLot)
 * -------------------------------------------------------------------------- */

/**
 * Yeni lot oluşturma isteği.
 * - `productId` zorunlu (Product.id referansı; GOAL-060).
 * - `lotNumber` zorunlu (tedarikçinin lot numarası; tenant
 *   içinde productId bazında benzersiz).
 * - `expiryDate` zorunlu (ISO datetime). Geçmiş tarihte SKT'ye
 *   izin verilmez (422 VET-INV-0003).
 * - `manufacturedAt` opsiyonel.
 * - `receivedAt` opsiyonlu (default: now).
 * - `supplierName` opsiyonel.
 * - `shelfId` opsiyonel (raf ataması; sonradan değiştirilebilir).
 * - `quantity` opsiyonel (Decimal string; bu partideki başlangıç
 *   miktarı; sonradan hareketlerle değişir; Faz 6 ileride).
 * - `notes` opsiyonel.
 */
export const stockLotCreateInputSchema = z
  .object({
    productId: z.string().min(1).max(100),
    lotNumber: z.string().min(1).max(100),
    expiryDate: z.string().datetime(),
    manufacturedAt: z.string().datetime().optional(),
    receivedAt: z.string().datetime().optional(),
    supplierName: z.string().max(200).optional(),
    shelfId: z.string().max(100).optional(),
    quantity: z
      .string()
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden miktar doğrulamasıdır.
      .regex(/^\d+(\.\d{1,4})?$/)
      .optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) => {
      if (v.manufacturedAt && v.expiryDate) {
        return new Date(v.manufacturedAt) <= new Date(v.expiryDate);
      }
      return true;
    },
    {
      message: "Üretim tarihi SKT'den sonra olamaz",
      path: ["manufacturedAt"],
    },
  );
export type StockLotCreateInput = z.infer<typeof stockLotCreateInputSchema>;

/** Lot kısmi güncelleme isteği. */
export const stockLotUpdateInputSchema = z
  .object({
    lotNumber: z.string().min(1).max(100).optional(),
    expiryDate: z.string().datetime().optional(),
    manufacturedAt: z.string().datetime().nullable().optional(),
    receivedAt: z.string().datetime().optional(),
    supplierName: z.string().max(200).nullable().optional(),
    shelfId: z.string().max(100).nullable().optional(),
    quantity: z
      .string()
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden miktar doğrulamasıdır.
      .regex(/^\d+(\.\d{1,4})?$/)
      .nullable()
      .optional(),
    notes: z.string().max(2000).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type StockLotUpdateInput = z.infer<typeof stockLotUpdateInputSchema>;

/** API response şeması. */
export const stockLotSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  productId: z.string(),
  lotNumber: z.string(),
  expiryDate: z.string().datetime(),
  manufacturedAt: z.string().datetime().nullable(),
  receivedAt: z.string().datetime(),
  supplierName: z.string().nullable(),
  shelfId: z.string().nullable(),
  quantity: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  archivedBy: z.string().nullable(),
  archiveReason: z.string().nullable(),
});
export type StockLot = z.infer<typeof stockLotSchema>;

/** Lot liste filtreleri. */
export const stockLotFiltersSchema = z.object({
  productId: z.string().optional(),
  shelfId: z.string().optional(),
  warehouseId: z.string().optional(),
  /** SKT'si bu tarihten önce olanları filtreler (yaklaşan/geçmiş). */
  expiresBefore: z.string().datetime().optional(),
  /** SKT'si bu tarihten sonra olanları filtreler. */
  expiresAfter: z.string().datetime().optional(),
  /** true: yalnızca geçmiş SKT'li lotlar; false: yalnızca gelecek. */
  expiredOnly: z.coerce.boolean().optional(),
  supplierName: z.string().optional(),
  lotNumber: z.string().optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type StockLotFilters = z.infer<typeof stockLotFiltersSchema>;

/** Liste response şeması. */
export const stockLotListResponseSchema = z.object({
  items: z.array(stockLotSchema),
  total: z.number().int().nonnegative(),
});
export type StockLotListResponse = z.infer<typeof stockLotListResponseSchema>;

/** Lot arşivleme isteği. */
export const stockLotArchiveInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type StockLotArchiveInput = z.infer<typeof stockLotArchiveInputSchema>;
