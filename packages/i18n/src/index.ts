/**
 * @file @vetniva/i18n kök modülü.
 * @module @vetniva/i18n
 * @description Frontend ve backend'in ortak kullandığı i18n kaynakları ve
 * yapılandırması. Sunucu tarafında `createCoreI18n`, istemci tarafında
 * `createBrowserI18n` kullanılır. İki fabrika ayrı tutularak Next.js
 * server bundle'ına `react-i18next` sızması engellenir.
 * @security Çeviri anahtarları PII içermez; anahtar adları büyük/küçük
 * harf ve nokta notasyonu ile sabit tanımlanır (i18next standardı).
 */

export { default as trTR } from "./locales/tr-TR.json" with { type: "json" };
export { default as enGB } from "./locales/en-GB.json" with { type: "json" };
export { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@vetniva/contracts";
export { createCoreI18n } from "./core.js";
export { createBrowserI18n } from "./browser.js";
export type { I18nConfig, TranslationResources } from "./types.js";
