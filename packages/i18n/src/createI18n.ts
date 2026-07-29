/**
 * @file i18next yapılandırma fabrikası.
 * @module @vetniva/i18n/createI18n
 *
 * @description Frontend tarafında kullanılacak i18next örneğini oluşturur.
 * Backend'de (NestJS) i18n modülü ayrıca yapılandırılır.
 *
 * @security Çeviri anahtarları yalnızca namespace + key formatındadır
 * (`app.name`, `common.save`). İçerikleri PII içermez; ancak kullanıcı
 * girdisi çeviri değerlerine gömülmez.
 */

import i18next, { type i18n as I18nInstance, type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "@vetniva/contracts";

import trTR from "./locales/tr-TR.json" with { type: "json" };
import enGB from "./locales/en-GB.json" with { type: "json" };
import type { I18nConfig } from "./types.js";

// i18next'in `ResourceLanguage` tipi düz anahtar/değer bekler; bizim
// JSON dosyalarımız iç içe objeler içeriyor. Runtime'da i18next
// iç içe yapıyı doğru çözümler; bu nedenle tip assertion güvenlidir.
const DEFAULT_RESOURCES = {
  "tr-TR": trTR,
  "en-GB": enGB,
} as unknown as Resource;

export function createI18n(config?: Partial<I18nConfig>): I18nInstance {
  const defaultLocale: Locale =
    config?.tenantLocale ?? config?.defaultLocale ?? DEFAULT_LOCALE;
  const fallbackLocale: Locale = config?.fallbackLocale ?? DEFAULT_LOCALE;
  const supportedLocales = config?.supportedLocales ?? SUPPORTED_LOCALES;
  const resources =
    (config?.resources as unknown as Resource | undefined) ?? DEFAULT_RESOURCES;

  const instance = i18next.createInstance();
  instance.use(initReactI18next).init({
    lng: defaultLocale,
    fallbackLng: fallbackLocale,
    supportedLngs: [...supportedLocales],
    resources,
    nsSeparator: ".",
    keySeparator: ".",
    interpolation: {
      escapeValue: false, // React zaten escape ediyor
    },
    returnNull: false,
    returnEmptyString: false,
  });
  return instance;
}
