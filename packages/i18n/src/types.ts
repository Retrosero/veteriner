/**
 * @file i18n tip tanımları.
 * @module @vetniva/i18n/types
 *
 * @description Çeviri kaynakları ve i18next yapılandırma tipleri.
 * JSON dosyaları yalnızca tip düzeyinde içe aktarılır; runtime
 * yükleme `index.ts` üzerinden `with { type: 'json' }` attribute ile
 * yapılır.
 *
 * @security JSON dosyaları runtime'da bu modülden yüklenmez; bu
 * sayede Node ESM "import attributes" standardına uyumlu kalınır.
 */

import type { Locale } from "@vetniva/contracts";

export type TranslationResources = {
  [K in Locale]: Record<string, unknown>;
};

export type I18nConfig = {
  defaultLocale: Locale;
  supportedLocales: readonly Locale[];
  fallbackLocale: Locale;
  resources: TranslationResources;
  /**
   * Tenant ayarı tarafından override edilebilir. Sağlanmazsa defaultLocale
   * kullanılır.
   */
  tenantLocale?: Locale;
};
