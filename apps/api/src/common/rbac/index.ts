/**
 * @file RBAC barrel export.
 * @module apps/api/common/rbac
 *
 * @description RBAC altyapısının tek import noktası. Controller ve
 * service'ler bu modülden import yapar; böylece internal yol
 * değişiklikleri dışarıyı etkilemez.
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

export { RbacModule } from "./rbac.module.js";
export {
  RbacService,
  AUTHZ_FORBIDDEN,
  AUTHZ_BRANCH_SCOPE_MISS,
  RBAC_TENANT_INACTIVE,
  RBAC_USER_INACTIVE,
  RBAC_SELF_ASSIGN,
  RBAC_LAST_OWNER,
  RBAC_BRANCH_MISMATCH,
} from "./rbac.service.js";
export { RbacRepository, type MembershipWithUser } from "./rbac.repository.js";
export { RbacController } from "./rbac.controller.js";
export { PermissionsGuard } from "./permissions.guard.js";
export { RolesGuard } from "./roles.guard.js";
export {
  RequirePermission,
  PERMISSIONS_KEY,
} from "./require-permission.decorator.js";
export { RequireRole, ROLE_KEY } from "./require-role.decorator.js";
export {
  loadPermissionCatalog,
  resetPermissionCatalogCache,
} from "./permission-catalog.loader.js";
export {
  PERMISSION_CATALOG,
  getPermissionIndex,
  findPermission,
} from "./permission-catalog.js";
export type {
  PermissionDefinition,
  PermissionDecision,
  PermissionEvaluationContext,
  TenantScopeFlag,
  BranchScopeFlag,
} from "./permission.types.js";
