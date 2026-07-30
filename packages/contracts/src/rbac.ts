/**
 * @file RBAC ve izin motoru sözleşmesi.
 * @module @vetniva/contracts/rbac
 *
 * @description GOAL-012 RBAC ve izin motoru için API sözleşmeleri.
 * Tenant üyelik yönetimi, branch context değişimi ve permission
 * kataloğu sorgulama işlemlerinin Zod şemaları + türetilmiş tipleri.
 *
 * Endpoint sözleşmeleri (FAZ-1):
 * - `GET    /rbac/me/permissions`           — Aktif kullanıcının permission listesi.
 * - `GET    /rbac/me/memberships`           — Aktif kullanıcının üyelikleri.
 * - `GET    /rbac/tenants/:tenantId/users`  — Tenant üyelerini listele.
 * - `POST   /rbac/tenants/:tenantId/users`  — Kullanıcıya tenant rolü ata.
 * - `DELETE /rbac/tenants/:tenantId/users/:userId` — Üyeliği iptal et.
 * - `PUT    /rbac/me/branch`                — Aktif branch context'ini değiştir.
 *
 * @security
 * - Tüm endpoint'ler `PermissionsGuard` + `@RequirePermissions()` ile korunur.
 * - SUPERADMIN ayrıcalıklı erişime sahiptir (cross-tenant yönetim).
 * - Tenant üyeliği atama/iptal `audit:rbac.membership.*` event'i üretir.
 * - Yetkisiz erişim `VET-AUTHZ-0001` (403) veya `VET-AUTHZ-0002` (404, branch
 *   scope) hata kodu ile reddedilir.
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 * @see docs/permissions/PERMISSION_CATALOG.yaml (113 permission)
 * @see docs/permissions/PERMISSION_MATRIX.md (rol bazlı matris)
 */

import { z } from "zod";

import { actorRoleSchema, tenantRoleSchema } from "./auth.js";

// -----------------------------------------------------------------------------
// TENANT MEMBERSHIP — Tenant üyelik modeli.
// -----------------------------------------------------------------------------

/** Tenant üyelik durumu. */
export const membershipStatusSchema = z.enum([
  "active",
  "suspended",
  "revoked",
]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

/** Tek bir tenant üyeliği özeti. */
export const membershipItemSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  /** Tenant içi rol (OWNER, VETERINARIAN, STAFF). */
  role: tenantRoleSchema,
  status: membershipStatusSchema,
  assignedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  /** Üyenin görünen adı (opsiyonel, mask'lenebilir). */
  displayName: z.string().max(200).optional(),
  email: z.string().email().optional(),
});
export type MembershipItem = z.infer<typeof membershipItemSchema>;

/** Tenant üyeleri listeleme yanıtı. */
export const membershipListResponseSchema = z.object({
  items: z.array(membershipItemSchema),
  total: z.number().int().min(0),
});
export type MembershipListResponse = z.infer<
  typeof membershipListResponseSchema
>;

/**
 * Kullanıcıya tenant içi rol atama isteği. Davet mekanizmasından
 * (GOAL-011) bağımsız olarak, mevcut bir kullanıcıya doğrudan
 * üyelik atamak için kullanılır. Kullanıcının farklı bir tenant'ta
 * zaten üyeliği olabilir; bu çağrı yalnızca hedef tenant'a yeni
 * üyelik ekler.
 */
export const assignMembershipRequestSchema = z.object({
  userId: z.string().uuid(),
  role: tenantRoleSchema,
});
export type AssignMembershipRequest = z.infer<
  typeof assignMembershipRequestSchema
>;

/** Üyelik atama başarılı yanıtı. */
export const assignMembershipResponseSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  role: tenantRoleSchema,
  status: membershipStatusSchema,
  assignedAt: z.string().datetime(),
});
export type AssignMembershipResponse = z.infer<
  typeof assignMembershipResponseSchema
>;

// -----------------------------------------------------------------------------
// BRANCH CONTEXT — Aktif branch değişimi (GOAL-012 RBAC).
// -----------------------------------------------------------------------------

/** Aktif branch değişim isteği. */
export const switchBranchRequestSchema = z.object({
  branchId: z.string().uuid().nullable(),
});
export type SwitchBranchRequest = z.infer<typeof switchBranchRequestSchema>;

/** Branch değişim yanıtı. Yeni aktif branch + güncellenmiş actor bağlamı. */
export const switchBranchResponseSchema = z.object({
  branchId: z.string().uuid().nullable(),
  sessionId: z.string().uuid(),
  /** Branch değişikliği audit event ID. */
  auditEventId: z.string().uuid(),
});
export type SwitchBranchResponse = z.infer<typeof switchBranchResponseSchema>;

// -----------------------------------------------------------------------------
// PERMISSION CATALOG — Kullanıcının kendi permission listesini sorgulama.
// -----------------------------------------------------------------------------

/** Tek bir permission anahtarı + metadata. */
export const permissionItemSchema = z.object({
  key: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  appliesToRoles: z.array(actorRoleSchema).readonly(),
  branchScopeRequired: z.boolean(),
  tenantScopeRequired: z.boolean(),
});
export type PermissionItem = z.infer<typeof permissionItemSchema>;

/** Aktif kullanıcının permission listesi yanıtı. */
export const myPermissionsResponseSchema = z.object({
  /** Permission anahtarları. */
  items: z.array(z.string().min(1).max(100)),
  /** Aktif rol (tenant bağlamı). */
  role: actorRoleSchema.nullable(),
  /** SUPERADMIN ise tüm permission'lar geçerlidir (bypass). */
  isSuperadmin: z.boolean(),
  /** Toplam permission sayısı (UI gösterimi için). */
  total: z.number().int().min(0),
});
export type MyPermissionsResponse = z.infer<typeof myPermissionsResponseSchema>;

/**
 * Aktif kullanıcının tüm üyelikleri. Multi-tenant üye kullanıcılar
 * için (ör. danışman, SUPERADMIN) hangi tenant'larda hangi rolde
 * olduğunu gösterir.
 */
export const myMembershipsResponseSchema = z.object({
  items: z.array(
    z.object({
      tenantId: z.string().uuid(),
      tenantSlug: z.string(),
      tenantName: z.string(),
      role: tenantRoleSchema.nullable(),
      status: membershipStatusSchema,
      assignedAt: z.string().datetime(),
    }),
  ),
  /** Aktif tenant (varsa). */
  activeTenantId: z.string().uuid().nullable(),
});
export type MyMembershipsResponse = z.infer<typeof myMembershipsResponseSchema>;

// -----------------------------------------------------------------------------
// Tüm rbac şemaları için ortak export.
// -----------------------------------------------------------------------------

export const rbacSchemas = {
  membershipStatus: membershipStatusSchema,
  membershipItem: membershipItemSchema,
  membershipList: membershipListResponseSchema,
  assignMembershipRequest: assignMembershipRequestSchema,
  assignMembershipResponse: assignMembershipResponseSchema,
  switchBranchRequest: switchBranchRequestSchema,
  switchBranchResponse: switchBranchResponseSchema,
  permissionItem: permissionItemSchema,
  myPermissions: myPermissionsResponseSchema,
  myMemberships: myMembershipsResponseSchema,
} as const;
