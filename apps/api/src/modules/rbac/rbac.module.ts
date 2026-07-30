/**
 * @file RBAC modülü.
 * @module apps/api/modules/rbac/rbac.module
 *
 * @description RbacService + PermissionsGuard + RolesGuard için DI
 * kabını sağlar.
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { Global, Module } from "@nestjs/common";

import { AuthModule } from "../../common/auth/auth.module.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { RbacService } from "./rbac.service.js";

@Global()
@Module({
  imports: [AuthModule],
  providers: [RbacService, PermissionsGuard, RolesGuard],
  exports: [RbacService, PermissionsGuard, RolesGuard],
})
export class RbacModule {}
