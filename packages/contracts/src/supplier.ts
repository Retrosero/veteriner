/**
 * @file Tedarikçi (supplier) kataloğu API sözleşmesi.
 * @module @vetniva/contracts/supplier
 *
 * @description GOAL-062 (FAZ-6) tedarikçi kataloğu için Zod şemaları
 * + tipler. Backend (request/response doğrulama) ve frontend
 * (form/typing) aynı kaynaktan tüketir.
 *
 * Tedarikçi kavramı (Supplier):
 * - Tedarikçi firma/şahıs bilgisi (ad, vergi no, iletişim).
 * - Tür: `clinic` (klinik sarf/ilaç), `petshop` (petshop ürün),
 *   `general` (her ikisi).
 * - Tenant içinde `code` benzersiz.
 * - Soft delete: `archivedAt` set edilir; geçmiş satın alma
 *   siparişleri audit trail'de korunur.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip. Tenant
 *   bilgisi sözleşmede taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { z } from "zod";

/** Tedarikçi türü. */
export const supplierTypeSchema = z.enum(["clinic", "petshop", "general"]);
export type SupplierType = z.infer<typeof supplierTypeSchema>;

/**
 * Yeni tedarikçi oluşturma isteği.
 * - `name` zorunlu (görünen ad).
 * - `code` zorunlu (kısa kod; tenant içinde benzersiz).
 * - `type` zorunlu (varsayılan: general).
 * - `taxId` opsiyonel (vergi no / VKN).
 * - `contactName` opsiyonel.
 * - `email` opsiyonel (email format).
 * - `phone` opsiyonel.
 * - `address` opsiyonel.
 * - `notes` opsiyonel.
 */
export const supplierCreateInputSchema = z.object({
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Yalnızca harf, rakam, tire ve alt çizgi"),
  type: supplierTypeSchema.optional().default("general"),
  taxId: z.string().max(32).optional(),
  contactName: z.string().max(200).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
export type SupplierCreateInput = z.infer<typeof supplierCreateInputSchema>;

/** Tedarikçi kısmi güncelleme isteği. */
export const supplierUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    code: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    type: supplierTypeSchema.optional(),
    taxId: z.string().max(32).nullable().optional(),
    contactName: z.string().max(200).nullable().optional(),
    email: z.string().email().max(200).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type SupplierUpdateInput = z.infer<typeof supplierUpdateInputSchema>;

/** API response şeması. */
export const supplierSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  type: supplierTypeSchema,
  taxId: z.string().nullable(),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
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
export type Supplier = z.infer<typeof supplierSchema>;

/** Tedarikçi liste filtreleri. */
export const supplierFiltersSchema = z.object({
  type: supplierTypeSchema.optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type SupplierFilters = z.infer<typeof supplierFiltersSchema>;

/** Liste response şeması. */
export const supplierListResponseSchema = z.object({
  items: z.array(supplierSchema),
  total: z.number().int().nonnegative(),
});
export type SupplierListResponse = z.infer<typeof supplierListResponseSchema>;

/** Arşivleme isteği. */
export const supplierArchiveInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type SupplierArchiveInput = z.infer<typeof supplierArchiveInputSchema>;
