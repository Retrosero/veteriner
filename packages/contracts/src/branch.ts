/**
 * @file Branch sözleşmesi.
 * @module @vetniva/contracts/branch
 *
 * @description Branch varlığı için Zod şeması ve tipler. Tenant
 * modülüne bağlı şubeleri temsil eder; pilot tek şube ile başlar
 * ancak veri modeli çoklu şubeye uygundur.
 *
 * @security Branch oluşturma `tenant:tenant` veya `branch:branch:create`
 *   yetkisi gerektirir (bkz. docs/permissions/PERMISSION_CATALOG.yaml).
 *   Branch kodu tenant içinde benzersizdir; çakışma 409 ile reddedilir.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 * @see docs/domain/DOMAIN_GLOSSARY.md
 */

import { z } from "zod";

/**
 * Şube durumu. Veritabanı enum'u ile bire bir eşleşir.
 */
export const branchStatusSchema = z.enum(["active", "inactive", "closed"]);
export type BranchStatus = z.infer<typeof branchStatusSchema>;

/**
 * Şube kodu formatı. Slug kurallarıyla aynı.
 */
export const branchCodeSchema = z
  .string()
  .min(2, "Şube kodu en az 2 karakter olmalı")
  .max(64, "Şube kodu en fazla 64 karakter olabilir")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
    "Şube kodu yalnızca küçük harf, rakam ve tire içerebilir",
  );

/**
 * Şube adres yapısı. JSON; ülke adaptörü `formatAddress` ile
 * string'e dönüştürür.
 */
export const branchAddressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2),
});
export type BranchAddress = z.infer<typeof branchAddressSchema>;

/**
 * Şube oluşturma isteği. `tenantId` body'de taşınmaz; URL'den alınır
 * (cross-tenant IDOR saldırısına karşı path-bound).
 */
export const createBranchRequestSchema = z.object({
  code: branchCodeSchema,
  name: z.string().min(2).max(200),
  city: z.string().min(1).max(100).optional(),
  address: branchAddressSchema.optional(),
  phone: z.string().min(5).max(32).optional(),
});
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;

/**
 * Şube güncelleme isteği. Tüm alanlar opsiyonel; en az bir alan
 * gereklidir.
 */
export const updateBranchRequestSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    city: z.string().min(1).max(100).optional(),
    address: branchAddressSchema.optional(),
    phone: z.string().min(5).max(32).optional(),
    status: branchStatusSchema.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.city !== undefined ||
      data.address !== undefined ||
      data.phone !== undefined ||
      data.status !== undefined,
    { message: "En az bir alan güncellenmelidir" },
  );
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;

/**
 * Şube API response şeması.
 */
export const branchResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  address: branchAddressSchema.nullable(),
  phone: z.string().nullable(),
  status: branchStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});
export type BranchResponse = z.infer<typeof branchResponseSchema>;

/**
 * Şube listesi response şeması. Bir tenant'ın tüm şubelerini döner.
 */
export const branchListResponseSchema = z.object({
  items: z.array(branchResponseSchema),
  total: z.number().int().nonnegative(),
});
export type BranchListResponse = z.infer<typeof branchListResponseSchema>;

/**
 * Şube listeleme sorgu parametreleri.
 */
export const listBranchesQuerySchema = z.object({
  status: branchStatusSchema.optional(),
});
export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;

/**
 * Şube arşivleme isteği. `reason` opsiyonel ama önerilir.
 */
export const archiveBranchRequestSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .optional();
export type ArchiveBranchRequest = z.infer<typeof archiveBranchRequestSchema>;
