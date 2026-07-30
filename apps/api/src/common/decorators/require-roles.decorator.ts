/**
 * @file @RequireRoles() dekoratörü.
 * @module apps/api/common/decorators/require-roles
 *
 * @description Endpoint'in kabul ettiği actor rollerini işaretler.
 * `RolesGuard` bu metadata'yı okur; aktörün rolü listede yoksa
 * 403 VET-AUTHZ-0001 ile reddedilir.
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { SetMetadata } from "@nestjs/common";

import type { ActorRole } from "../permissions/permission-spec.js";

export const ROLES_KEY = "rbac:roles";

export const RequireRoles = (
  ...roles: ReadonlyArray<ActorRole>
): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles as ReadonlyArray<string>);
