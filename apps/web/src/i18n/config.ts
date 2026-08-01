/**
 * @file Apps/web i18n yapılandırması.
 * @module @vetniva/web/i18n/config
 * @description I18next örneğinin server ve client component'lerde
 * tutarlı biçimde oluşturulmasını sağlar. Server tarafında
 * `createCoreI18n` (React context'e bağımlı değil), client tarafında
 * `createBrowserI18n` (`initReactI18next` plugin'i ile) kullanılır.
 * Bu ayrım sayesinde Next.js server bundle'ına `react-i18next`
 * sızmaz.
 * @security Bu modül kullanıcı girdisi taşımaz; yalnızca URL'den
 * alınan doğrulanmış locale bilgisini kullanır.
 */

import { type Locale } from "@vetniva/contracts";
import { createCoreI18n } from "@vetniva/i18n";
import { type i18n as I18nInstance } from "i18next";

/**
 * Server component'ler ve server-side render sırasında kullanılacak
 * i18next örneği üretir. React context API'sine bağımlılığı yoktur;
 * yalnızca `t()` ile çeviri çözümlemesi yapılır.
 * @param tenantLocale
 */
export function getServerI18n(tenantLocale: Locale): I18nInstance {
  return createCoreI18n({ tenantLocale });
}

/**
 * Server component'ler için çeviri fonksiyonu. I18next örneğinin
 * `t` metoduna ince bir sarmalayıcıdır; tüm çeviri çağrıları
 * sunucu tarafında gerçekleşir ve HTML'e gömülür.
 * @param tenantLocale
 */
export function getT(
  tenantLocale: Locale,
): (key: string, options?: Record<string, unknown>) => string {
  const instance = getServerI18n(tenantLocale);
  return (key: string, options?: Record<string, unknown>) =>
    instance.t(key, options ?? {});
}
