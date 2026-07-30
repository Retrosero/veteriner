/**
 * @file Auth modülü.
 * @module apps/api/common/auth/auth.module
 *
 * @description Kimlik doğrulama bağımlılıklarını toplar. Tenant
 * repository'si authService'e inject edilir (davet kabul sonrası
 * tenant bilgisi).
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { Module } from "@nestjs/common";

import { ActorModule } from "../actor/actor.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { TenantModule } from "../../modules/tenant/tenant.module.js";

import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { BruteForceGuard } from "./brute-force.js";

@Module({
  imports: [PrismaModule, AuditModule, ActorModule, TenantModule],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, AuthGuard, BruteForceGuard],
  exports: [AuthService, AuthGuard, BruteForceGuard, AuthRepository],
})
export class AuthModule {}
