/**
 * @file Onboarding DI modülü.
 * @module apps/api/common/onboarding/onboarding.module
 *
 * @description OnboardingService'i DI container'a ekler.
 * Global modül; ai/onboarding controller'ı tarafından tüketilir.
 *
 * @since GOAL-117 (FAZ-11) ilk kullanım asistanı
 */

import { Global, Module } from "@nestjs/common";

import { OnboardingService } from "./onboarding.service.js";

@Global()
@Module({
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
