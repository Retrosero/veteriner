/**
 * @file RBAC modülü.
 * @module apps/api/common/rbac/rbac.module
 *
 * @description RBAC altyapısını (RbacService, RbacRepository,
 * PermissionsGuard, RolesGuard, RbacController) DI kabına bağlar.
 * AuditService ve PrismaService global modüllerden otomatik inject
 * edilir.
 *
 * NOT: Guard global kayıt `main.ts` üzerinden `APP_GUARD` ile
 * yapılır; burada yalnızca DI sağlanır.
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { Global, Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";

import { PermissionsGuard } from "./permissions.guard.js";
import { RbacController } from "./rbac.controller.js";
import { RbacRepository } from "./rbac.repository.js";
import { RbacService } from "./rbac.service.js";
import { RolesGuard } from "./roles.guard.js";

@Global()
@Module({
  imports: [AuditModule],
  controllers: [RbacController],
  providers: [RbacService, RbacRepository, PermissionsGuard, RolesGuard],
  exports: [RbacService, RbacRepository, PermissionsGuard, RolesGuard],
})
export class RbacModule {}
