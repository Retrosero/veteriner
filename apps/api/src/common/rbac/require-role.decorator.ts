/**
 * @file @RequireRole() dekoratörü.
 * @module apps/api/common/rbac/require-role.decorator
 *
 * @description Endpoint'in kabul ettiği actor rollerini işaretler.
 * `RolesGuard` bu metadata'yı okur; aktörün rolü listede yoksa
 * 403 VET-AUTHZ-0001 ile reddedilir.
 *
 * Kullanım:
 * ```ts
 * @Post()
 * @RequireRole('OWNER', 'VETERINARIAN')
 * public create(@Body() dto: CreateExaminationDto) { ... }
 * ```
 *
 * NOT: Permission-bazlı kontrolden daha gevşektir. Hassas
 * endpoint'lerde `@RequirePermission()` tercih edilmelidir.
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { SetMetadata } from "@nestjs/common";

import type { ActorRole } from "../actor/actor-context.service.js";

/** Roles metadata anahtarı. */
export const ROLE_KEY = "rbac:role";

/**
 * Rol zorunluluğu işaretleyicisi. OR semantiği (herhangi biri yeterli).
 */
export const RequireRole = (
  ...roles: ReadonlyArray<ActorRole>
): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLE_KEY, roles);
