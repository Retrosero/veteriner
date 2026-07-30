/**
 * @file Superadmin tenant görünümü sözleşmesi.
 * @module @vetniva/contracts/superadmin
 *
 * @description SUPERADMIN paneli için tenant listesi ve detay
 * sözleşmeleri. GOAL-016 (FAZ-1) superadmin tenant görünümü core
 * kapsamında tanıtıldı; DB view katmanı sonraki görevlerde eklenecek
 * (şimdilik service in-memory aggregation yapar).
 *
 * @security Bu sözleşmeleri tüketen tüm endpoint'ler
 *   `@RequirePermissions('audit:log:read')` ile korunur; SUPERADMIN
 *   bypass PermissionsGuard üzerinden uygulanır. Cross-tenant
 *   denemesi 404 (bilgi sızdırmaz).
 *
 * @since GOAL-016 (FAZ-1) superadmin tenant görünümü
 */

import { z } from "zod";

import { tenantCountrySchema, tenantStatusSchema } from "./tenant.js";

/**
 * SUPERADMIN tenant liste/detay öğesi. Tenant özet metrikleri ile
 * birlikte. Detay response'unda `recentEvents` eklenir.
 */
export const tenantOverviewSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string(),
  country: tenantCountrySchema,
  status: tenantStatusSchema,
  createdAt: z.string().datetime(),
  branchCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
  enabledModules: z.array(z.string()),
  lastLoginAt: z.string().datetime().nullable(),
  errorCountLast24h: z.number().int().nonnegative(),
  storageUsedMb: z.number().nonnegative(),
});
export type TenantOverview = z.infer<typeof tenantOverviewSchema>;

/**
 * Audit event özeti. SUPERADMIN tenant detayında son olayları
 * göstermek için kullanılır.
 */
export const auditEventSummarySchema = z.object({
  id: z.string().uuid(),
  eventName: z.string(),
  actorId: z.string().nullable(),
  targetType: z.string(),
  targetId: z.string(),
  createdAt: z.string().datetime(),
});
export type AuditEventSummary = z.infer<typeof auditEventSummarySchema>;

/**
 * Tenant detay response'u. `TenantOverview` + son audit event'ler.
 */
export const tenantDetailResponseSchema = tenantOverviewSchema.extend({
  recentEvents: z.array(auditEventSummarySchema),
});
export type TenantDetailResponse = z.infer<typeof tenantDetailResponseSchema>;

/**
 * SUPERADMIN tenant liste response'u. Sayfalama metadata'sı ile.
 */
export const listSuperadminTenantsResponseSchema = z.object({
  items: z.array(tenantOverviewSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type ListSuperadminTenantsResponse = z.infer<
  typeof listSuperadminTenantsResponseSchema
>;

/**
 * SUPERADMIN tenant listesi sorgu parametreleri. Standart filtreler
 * (status, country, search) + sayfalama.
 */
export const listSuperadminTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: tenantStatusSchema.optional(),
  country: tenantCountrySchema.optional(),
  search: z.string().min(1).max(100).optional(),
});
export type ListSuperadminTenantsQuery = z.infer<
  typeof listSuperadminTenantsQuerySchema
>;
