/**
 * @file Onboarding barrel export.
 * @module apps/api/common/onboarding
 *
 * @description Onboarding modülü için tek giriş noktası.
 * Controller ve diğer modüller bu barrel üzerinden tüketir.
 *
 * @since GOAL-117 (FAZ-11) ilk kullanım asistanı
 */

export * from "./onboarding.types.js";
export * from "./onboarding.service.js";
export * from "./onboarding.module.js";
