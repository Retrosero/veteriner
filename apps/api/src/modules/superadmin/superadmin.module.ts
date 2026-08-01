/**
 * @file Superadmin modülü.
 * @module apps/api/modules/superadmin/superadmin.module
 *
 * @description SUPERADMIN tenant görünümü feature modülü.
 *   Controller + service DI'a eklenir. PrismaService global,
 *   FeatureFlagService FeatureFlagModule'dan gelir.
 *
 * @since GOAL-016 (FAZ-1) superadmin tenant görünümü
 */

import { Module } from "@nestjs/common";

import { SuperadminController } from "./superadmin.controller.js";
import { SuperadminService } from "./superadmin.service.js";
import { FeatureFlagModule } from "../feature-flag/feature-flag.module.js";

@Module({
  imports: [FeatureFlagModule],
  controllers: [SuperadminController],
  providers: [SuperadminService],
  exports: [SuperadminService],
})
export class SuperadminModule {}
