/**
 * @file Auth modülü.
 * @module apps/api/common/auth/auth.module
 * @description Kimlik doğrulama bağımlılıklarını toplar. Tenant
 * repository'si authService'e inject edilir (davet kabul sonrası
 * tenant bilgisi).
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { Module } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";

import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { BruteForceGuard } from "./brute-force.js";
import { TenantModule } from "../../modules/tenant/tenant.module.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { ActorModule } from "../actor/actor.module.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [PrismaModule, AuditModule, ActorModule, TenantModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    {
      // Vitest/Vite ile E2E'de decorator metadata'sı çıkarılmadığında da
      // guard bağımlılıklarının açık ve üretimle aynı kalmasını sağlar.
      provide: AuthGuard,
      useFactory: (auth: AuthService, reflector: Reflector): AuthGuard =>
        new AuthGuard(auth, reflector),
      inject: [AuthService, Reflector],
    },
    BruteForceGuard,
    {
      provide: APP_GUARD,
      useExisting: AuthGuard,
    },
  ],
  exports: [AuthService, AuthGuard, BruteForceGuard, AuthRepository],
})
export class AuthModule {}
