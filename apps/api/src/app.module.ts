/**
 * @file Kök NestJS modülü.
 * @module apps/api
 *
 * @description Tüm feature modüllerini birleştirir. ConfigModule zod
 * ile env doğrulaması yapar; PrismaModule global olarak PrismaService'i
 * dışa aktarır.
 *
 * Global modüller:
 * - ConfigModule (env)
 * - PrismaModule (DB)
 * - AuditModule (audit + log)
 * - ActorModule (GOAL-010 header placeholder; AuthGuard session varsa override)
 * - AuthModule (GOAL-011 kimlik doğrulama)
 * - RbacModule (GOAL-012 RBAC ve izin motoru)
 *
 * Feature modüller:
 * - HealthModule
 * - AiModule
 * - TenantModule (FAZ-1)
 * - BranchModule (FAZ-1)
 * - IdentityModule (FAZ-1 — /me endpointleri)
 *
 * @security Auth guard controller-level'ında çalışır; header
 * placeholder fallback'i ActorInterceptor'da korunur (test/dev
 * uyumu için). RBAC guard (PermissionsGuard) isteğe bağlı olarak
 * controller'larda `@UseGuards(PermissionsGuard)` ile uygulanır;
 * global guard kaydı GOAL-012 sonrası yapılabilir.
 */

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ActorModule } from "./common/actor/actor.module.js";
import { AuthModule } from "./common/auth/auth.module.js";
import { RbacModule } from "./modules/rbac/rbac.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { AiFeatureModule } from "./modules/ai/ai.module.js";
import { BranchModule } from "./modules/branch/branch.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { TenantModule } from "./modules/tenant/tenant.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    PrismaModule,
    ActorModule,
    AuthModule,
    RbacModule,
    HealthModule,
    AiFeatureModule,
    TenantModule,
    BranchModule,
    IdentityModule,
  ],
})
export class AppModule {}
