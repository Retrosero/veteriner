/**
 * @file Kök NestJS modülü.
 * @module apps/api
 *
 * @description Tüm feature modüllerini birleştirir. ConfigModule zod
 * ile env doğrulaması yapar; PrismaModule global olarak PrismaService'i
 * dışa aktarır. GOAL-000 kapsamında yalnızca HealthModule bağlıdır.
 *
 * @security Tenant bağlamı (TenantModule, AuthModule, AuditModule)
 * GOAL-001'de eklenecektir.
 */

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { HealthModule } from "./modules/health/health.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
