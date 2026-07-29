/**
 * @file i18next + react-i18next tarayıcı fabrikası.
 * @module @vetniva/i18n/browser
 *
 * @description Yalnızca tarayıcı (client component) ortamında
 * çağrılması gereken i18n fabrikası. `initReactI18next` plugin'i
 * bu modülde eklenir; server bundle'a sızmasını engellemek için
 * `react-i18next` import'u doğrudan modülün tepesinde yapılır ve
 * bu modül sadece "use client" bileşenlerden içe aktarılır.
 *
 * Next.js App Router'da: bu fonksiyonu çağıran dosyanın tepesinde
 * `"use client"` direktifi bulunmalıdır. Aksi halde server bundle'a
 * `react-i18next` sızar ve `TypeError: createContext is not a function`
 * hatası oluşur.
 *
 * @security react-i18next yalnızca client bundle'da değerlendirilir;
 * server tarafında bu modül import edilmemelidir.
 */

"use client";

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

const DEFAULT_RESOURCES = {
  "tr-TR": trTR,
  "en-GB": enGB,
} as unknown as Resource;

/**
 * Tarayıcı tarafında (client component) `useTranslation` hook'u
 * ile birlikte kullanılacak i18n örneği üretir. React context
 * API'si yalnızca bu modülde etkindir.
 *
 * @example
 * ```tsx
 * "use client";
 * import { I18nextProvider } from "react-i18next";
 * import { createBrowserI18n } from "@vetniva/i18n/browser";
 *
 * const i18n = createBrowserI18n();
 * <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
 * ```
 */
export function createBrowserI18n(
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
  instance.use(initReactI18next);

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
