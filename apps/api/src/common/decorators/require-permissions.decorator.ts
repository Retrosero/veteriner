/**
 * @file @RequirePermissions() dekoratörü.
 * @module apps/api/common/decorators/require-permissions
 *
 * @description Endpoint'in ihtiyaç duyduğu permission anahtarlarını
 * işaretler. `PermissionsGuard` bu metadata'yı okur.
 *
 * @security Bu dekoratör tek başına yetki kontrolü YAPMAZ.
 *   `PermissionsGuard` ile birlikte kullanılmalıdır.
 *
 * @since GOAL-002 (FAZ-0) yetki matrisi
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { SetMetadata } from "@nestjs/common";

import type { Permission } from "../permissions/permission-spec.js";

export const PERMISSIONS_KEY = "rbac:permissions";

export const RequirePermissions = (
  ...permissions: ReadonlyArray<Permission>
): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions as ReadonlyArray<string>);
