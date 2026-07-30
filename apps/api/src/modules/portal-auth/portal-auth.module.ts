/**
 * @file Portal auth modülü.
 * @module apps/api/modules/portal-auth/portal-auth.module
 *
 * @description GOAL-033 hasta sahibi portal hesap kayıt ve giriş
 * feature modülü. Service + repository + controller DI'a eklenir.
 * AuditService global modülden gelir.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal kayıt ve giriş
 */

import { Module } from "@nestjs/common";

import { AuthModule } from "../../common/auth/auth.module.js";
import { AuditModule } from "../../common/audit/audit.module.js";

import { PortalAuthController } from "./portal-auth.controller.js";
import { PortalAuthRepository } from "./portal-auth.repository.js";
import { PortalAuthService } from "./portal-auth.service.js";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [PortalAuthController],
  providers: [PortalAuthRepository, PortalAuthService],
  exports: [PortalAuthService, PortalAuthRepository],
})
export class PortalAuthModule {}
