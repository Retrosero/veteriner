/**
 * @file @vetniva/i18n kök modülü.
 * @module @vetniva/i18n
 *
 * @description Frontend ve backend'in ortak kullandığı i18n kaynakları ve
 * yapılandırması. Yeni çeviri anahtarı eklenirken `src/locales/tr-TR.json`
 * dosyasına eklenmeli; İngilizce karşılığı Faz 14'te doldurulacaktır.
 *
 * @security Çeviri anahtarları PII içermez; anahtar adları da büyük/küçük
 * harf ve nokta notasyonu ile sabit tanımlanır (i18next standardı).
 */

export { default as trTR } from "./locales/tr-TR.json" with { type: "json" };
export { default as enGB } from "./locales/en-GB.json" with { type: "json" };
export { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@vetniva/contracts";
export { createI18n } from "./createI18n.js";
export type { I18nConfig, TranslationResources } from "./types.js";
