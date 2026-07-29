/**
 * @file i18next çekirdek fabrikası (server-safe).
 * @module @vetniva/i18n/core
 *
 * @description Yalnızca i18next kütüphanesini kullanarak server-side
 * ve browser ortamlarında güvenle çalışan bir i18n örneği oluşturur.
 * React context'e bağımlı plugin'ler (örn. `initReactI18next`)
 * burada KULLANILMAZ; tarayıcı tarafında eklenmesi gerekiyorsa
 * `browser.ts` içindeki `createBrowserI18n` kullanılmalıdır.
 *
 * @security Bu modül server bundle'a güvenle girer; React context
 * API'sine bağımlılığı yoktur. NestJS backend ve Next.js sunucu
 * tarafı bu modülü kullanır.
 */

import i18next, { type i18n as I18nInstance, type Resource } from "i18next";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "@vetniva/contracts";

import trTR from "./locales/tr-TR.json" with { type: "json" };
import enGB from "./locales/en-GB.json" with { type: "json" };
import type { I18nConfig } from "./types.js";

/**
 * i18next'in `ResourceLanguage` tipi düz anahtar/değer bekler; bizim
 * JSON dosyalarımız iç içe objeler içeriyor. Runtime'da i18next
 * iç içe yapıyı doğru çözümler; bu nedenle tip assertion güvenlidir.
 */
const DEFAULT_RESOURCES = {
  "tr-TR": trTR,
  "en-GB": enGB,
} as unknown as Resource;

/**
 * Server tarafında ve React context'i olmayan ortamlarda
 * kullanılacak i18n örneği üretir. `initReactI18next` gibi
 * React'e bağımlı plugin'ler YÜKLENMEZ; bu sayede Next.js
 * server bundle'ında `createContext is not a function` hatası
 * oluşmaz.
 *
 * @example
 * ```ts
 * // Sunucu tarafı (RSC, route handler, action)
 * const i18n = createCoreI18n({ tenantLocale: "en-GB" });
 * const title = i18n.t("app.dashboard");
 * ```
 */
export function createCoreI18n(
  config?: Partial<I18nConfig>,
): I18nInstance {
  const defaultLocale: Locale =
    config?.tenantLocale ?? config?.defaultLocale ?? DEFAULT_LOCALE;
  const fallbackLocale: Locale = config?.fallbackLocale ?? DEFAULT_LOCALE;
  const supportedLocales = config?.supportedLocales ?? SUPPORTED_LOCALES;
  const resources =
    (config?.resources as unknown as Resource | undefined) ??
    DEFAULT_RESOURCES;

  const instance = i18next.createInstance();

  instance.init({
    lng: defaultLocale,
    fallbackLng: fallbackLocale,
    supportedLngs: [...supportedLocales],
    resources,
    nsSeparator: ".",
    keySeparator: ".",
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    returnEmptyString: false,
  });

  return instance;
}
