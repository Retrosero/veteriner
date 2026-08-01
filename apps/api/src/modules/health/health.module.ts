/**
 * @file HealthModule.
 * @module apps/api/modules/health
 * @description Sağlık kontrolü modülü. Liveness ve readiness
 * endpoint'lerini sağlar. PrismaService'i (global) kullanır.
 */

import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
