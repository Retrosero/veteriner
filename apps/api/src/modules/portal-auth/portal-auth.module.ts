/**
 * @file Portal auth modülü.
 * @module apps/api/modules/portal-auth/portal-auth.module
 *
 * @description GOAL-033 hasta sahibi portal hesap kayıt ve giriş
 * feature modülü. Service + repository + controller + guard DI'a
 * eklenir. Davet üzerinden kayıt için PortalModule'den PortalService
 * inject edilir (cross-module davet çözümlemesi). AuditService
 * global modülden gelir.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal kayıt ve giriş
 */

import { Module } from "@nestjs/common";

import { AuthModule } from "../../common/auth/auth.module.js";
import { AuditModule } from "../../common/audit/audit.module.js";
import { PortalModule } from "../portal/portal.module.js";

import { PortalAuthController } from "./portal-auth.controller.js";
import { PortalAuthRepository } from "./portal-auth.repository.js";
import { PortalAuthService } from "./portal-auth.service.js";
import { PortalSessionGuard } from "./portal-session.guard.js";

@Module({
  imports: [AuthModule, AuditModule, PortalModule],
  controllers: [PortalAuthController],
  providers: [PortalAuthRepository, PortalAuthService, PortalSessionGuard],
  exports: [PortalAuthService, PortalAuthRepository, PortalSessionGuard],
})
export class PortalAuthModule {}
