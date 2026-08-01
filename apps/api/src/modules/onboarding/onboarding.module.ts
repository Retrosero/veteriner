/**
 * @file Onboarding feature modülü.
 * @module apps/api/modules/onboarding/onboarding.module
 *
 * @description Onboarding controller'ını DI container'a ekler.
 * Common/OnboardingModule (global) servis sağlar; bu modül
 * yalnızca controller kaydını yapar.
 *
 * @since GOAL-117 (FAZ-11) ilk kullanım asistanı
 */

import { Module } from "@nestjs/common";

import { OnboardingController } from "./onboarding.controller.js";
import { OnboardingModule as CommonOnboardingModule } from "../../common/onboarding/index.js";

@Module({
  imports: [CommonOnboardingModule],
  controllers: [OnboardingController],
})
export class OnboardingFeatureModule {}
