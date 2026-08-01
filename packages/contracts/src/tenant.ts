/**
 * @file Tenant sözleşmesi.
 * @module @vetniva/contracts/tenant
 *
 * @description Tenant varlığı için Zod şeması ve tipler. API ile
 * frontend arasındaki tek doğruluk kaynağıdır. Backend Prisma modelinden
 * DTO'ya, frontend form/doğrulamaya kadar aynı tip kullanılır.
 *
 * @security Tenant.slug yalnızca küçük harf, rakam ve tire içerebilir
 *   (URL-dostu). Tenant oluşturma yalnızca SUPERADMIN tarafından
 *   yapılır; API bu kontrolü Permission kataloğunda `tenant:tenant:create`
 *   ile doğrular (bkz. docs/permissions/PERMISSION_CATALOG.yaml).
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 * @see docs/domain/DOMAIN_GLOSSARY.md
 */

import { z } from "zod";

/**
 * Tenant durumu. Veritabanı enum'u ile bire bir eşleşir.
 */
export const tenantStatusSchema = z.enum(["active", "suspended", "closed"]);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

/**
 * Desteklenen tenant ülkeleri. ISO 3166-1 alpha-2.
 */
export const tenantCountrySchema = z.enum(["TR", "GB"]);
export type TenantCountry = z.infer<typeof tenantCountrySchema>;

/**
 * Tenant slug formatı: küçük harf, rakam ve tire; başta ve sonda tire yok.
 * Maksimum 64 karakter.
 */
export const tenantSlugSchema = z
  .string()
  .min(2, "Slug en az 2 karakter olmalı")
  .max(64, "Slug en fazla 64 karakter olabilir")
  .regex(
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, karakter sınıfı ve tekrarları üst sınırlı slug doğrulamasıdır.
    /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
    "Slug yalnızca küçük harf, rakam ve tire içerebilir",
  );

/**
 * Tenant oluşturma isteği. SUPERADMIN endpoint'i tarafından kabul edilir.
 */
export const createTenantRequestSchema = z.object({
  slug: tenantSlugSchema,
  name: z.string().min(2).max(200),
  country: tenantCountrySchema,
  defaultLocale: z.enum(["tr-TR", "en-GB"]).default("tr-TR").optional(),
  timezone: z.string().min(1).max(64).optional(),
  taxId: z.string().min(10).max(20).optional(),
  taxIdType: z.enum(["company", "personal"]).optional(),
  contactEmail: z.string().email().max(200).optional(),
});
export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;

/**
 * Tenant güncelleme isteği. Tüm alanlar opsiyonel; en az bir alan
 * gereklidir (servis katmanında doğrulanır).
 */
export const updateTenantRequestSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    contactEmail: z.string().email().max(200).optional(),
    timezone: z.string().min(1).max(64).optional(),
    status: tenantStatusSchema.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.contactEmail !== undefined ||
      data.timezone !== undefined ||
      data.status !== undefined,
    { message: "En az bir alan güncellenmelidir" },
  );
export type UpdateTenantRequest = z.infer<typeof updateTenantRequestSchema>;

/**
 * Tenant kapatma isteği. `reason` zorunludur; operasyonel not olarak
 * audit event'ine yazılır.
 */
export const closeTenantRequestSchema = z.object({
  reason: z.string().min(3).max(500),
});
export type CloseTenantRequest = z.infer<typeof closeTenantRequestSchema>;

/**
 * Tenant API response şeması. Dahili alanlar (`taxId`, `contactEmail`)
 * yalnızca yetkili rollere (SUPERADMIN, OWNER) döner.
 */
export const tenantResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  country: tenantCountrySchema,
  defaultLocale: z.string(),
  timezone: z.string(),
  status: tenantStatusSchema,
  taxId: z.string().nullable(),
  taxIdType: z.enum(["company", "personal"]).nullable(),
  contactEmail: z.string().email().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  archivedReason: z.string().nullable(),
});
export type TenantResponse = z.infer<typeof tenantResponseSchema>;

/**
 * Tenant listesi response şeması. Sayfalama metadata'sı ile birlikte.
 */
export const tenantListResponseSchema = z.object({
  items: z.array(tenantResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type TenantListResponse = z.infer<typeof tenantListResponseSchema>;

/**
 * Tenant listesi sorgu parametreleri.
 */
export const listTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: tenantStatusSchema.optional(),
  country: tenantCountrySchema.optional(),
  search: z.string().min(1).max(100).optional(),
});
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;
