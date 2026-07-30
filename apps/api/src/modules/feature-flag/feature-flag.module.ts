/**
 * @file FeatureFlag modülü.
 * @module apps/api/modules/feature-flag
 *
 * @description Modül/feature flag altyapısı DI kabı. AuditService
 * global modülden otomatik inject edilir.
 *
 * @since GOAL-013 (FAZ-1) modül/feature flag altyapısı
 */

import { Module } from "@nestjs/common";

import { FeatureFlagController } from "./feature-flag.controller.js";
import { FeatureFlagService } from "./feature-flag.service.js";
import { ModuleEnabledGuard } from "../../common/guards/module-enabled.guard.js";

@Module({
  controllers: [FeatureFlagController],
  providers: [FeatureFlagService, ModuleEnabledGuard],
  exports: [FeatureFlagService, ModuleEnabledGuard],
})
export class FeatureFlagModule {}
