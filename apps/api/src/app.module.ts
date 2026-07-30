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
 * - ActorModule (GOAL-010 auth placeholder)
 *
 * Feature modüller (GOAL-010+):
 * - HealthModule
 * - AiModule
 * - TenantModule (FAZ-1)
 * - BranchModule (FAZ-1)
 *
 * @security Auth guard (GOAL-011) bu modüle eklenecek.
 */

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ActorModule } from "./common/actor/actor.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { AiFeatureModule } from "./modules/ai/ai.module.js";
import { BranchModule } from "./modules/branch/branch.module.js";
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
    HealthModule,
    AiFeatureModule,
    TenantModule,
    BranchModule,
  ],
})
export class AppModule {}
