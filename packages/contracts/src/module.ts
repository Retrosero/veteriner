/**
 * @file Feature flag (modül) sözleşmesi.
 * @module @vetniva/contracts/module
 *
 * @description Tenant bazında açılıp kapatılabilen modüllerin API
 * sözleşmesi. Backend `FeatureFlagService` ile frontend modül
 * yönetim UI'ı arasındaki tek doğruluk kaynağıdır. Modül anahtar
 * listesi `apps/api/src/common/modules/module.types.ts` ile
 * eşleşir; burada Zod şeması olarak tekrar tanımlanır ki frontend
 * import edebilsin.
 *
 * @security Bir modülün devre dışı olması bilgi sızdırmaz; ilgili
 *   endpoint 403 döner, hata detayında yalnızca modül adı yer alır.
 *
 * @since GOAL-013 (FAZ-1) modül/feature flag altyapısı
 */

import { z } from "zod";

/**
 * Tenant bazında yönetilebilen iş modülleri. Backend tarafındaki
 * `ALL_MODULE_KEYS` ile senkronize tutulmalıdır (CI `docs:check`
 * kapısı bu eşleşmeyi doğrulayacak).
 */
export const moduleKeySchema = z.enum([
  "clinic",
  "appointments",
  "vaccinations",
  "inventory",
  "petshop",
  "billing",
  "hospitalization",
  "laboratory",
  "imaging",
  "portal",
]);
export type ModuleKey = z.infer<typeof moduleKeySchema>;

/**
 * Modül durumu (listeleme/yanıt için).
 */
export const moduleStatusSchema = z.object({
  key: moduleKeySchema,
  enabled: z.boolean(),
});
export type ModuleStatus = z.infer<typeof moduleStatusSchema>;

/**
 * Modül listesi response.
 */
export const moduleListResponseSchema = z.object({
  items: z.array(moduleStatusSchema),
});
export type ModuleListResponse = z.infer<typeof moduleListResponseSchema>;

/**
 * Modül enable/disable isteği.
 */
export const setModuleEnabledRequestSchema = z.object({
  enabled: z.boolean(),
});
export type SetModuleEnabledRequest = z.infer<
  typeof setModuleEnabledRequestSchema
>;

/**
 * Modül enable/disable response.
 */
export const setModuleEnabledResponseSchema = moduleStatusSchema;
export type SetModuleEnabledResponse = z.infer<
  typeof setModuleEnabledResponseSchema
>;
