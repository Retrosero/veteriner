/**
 * @file Tenant modülü.
 * @module apps/api/modules/tenant/tenant.module
 *
 * @description Tenant feature modülü. Controller, service ve
 * repository DI'a eklenir. AuditService ve ActorContextService global
 * olduğundan otomatik inject edilir.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { Module } from "@nestjs/common";

import { TenantController } from "./tenant.controller.js";
import { TenantRepository } from "./tenant.repository.js";
import { TenantService } from "./tenant.service.js";

@Module({
  controllers: [TenantController],
  providers: [TenantService, TenantRepository],
  exports: [TenantService, TenantRepository],
})
export class TenantModule {}
