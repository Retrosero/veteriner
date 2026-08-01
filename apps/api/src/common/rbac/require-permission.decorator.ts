/**
 * @file Permission dekoratörü.
 * @module apps/api/common/rbac/require-permission.decorator
 *
 * @since GOAL-002 (FAZ-0) yetki matrisi
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { SetMetadata } from "@nestjs/common";

/** Permission metadata anahtarı. */
export const PERMISSIONS_KEY = "rbac:permissions";

/**
 * Permission zorunluluğu işaretleyicisi. Birden fazla permission
 * verilirse hepsi gerekli olur (AND semantiği).
 */
export const RequirePermission = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
