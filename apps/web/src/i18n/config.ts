/**
 * @file apps/web i18n yapılandırması.
 * @module @vetniva/web/i18n/config
 *
 * @description i18next örneğinin server component'lerde ve client
 * component'lerde tutarlı biçimde oluşturulmasını sağlar. createI18n
 * paketi `@vetniva/i18n` üzerinden gelir; burada yalnızca tenant
 * locale'ini parametre olarak geçiririz.
 *
 * @security Bu modül kullanıcı girdisi taşımaz; yalnızca URL'den
 * alınan doğrulanmış locale bilgisini kullanır.
 */

import { type i18n as I18nInstance } from "i18next";

import { type Locale } from "@vetniva/contracts";
import { createI18n } from "@vetniva/i18n";

/**
 * Tenant locale'i ile i18next örneği oluşturur. Server ve client
 * tarafında aynı fabrika kullanılır; resources bellekte zaten yüklü
 * olduğu için init() senkron tamamlanır.
 */
export function getI18n(tenantLocale: Locale): I18nInstance {
  return createI18n({ tenantLocale });
}

/**
 * Server component'ler için çeviri fonksiyonu. createI18n örneğinin
 * `t` metoduna ince bir sarmalayıcıdır; tüm çeviri çağrıları
 * sunucu tarafında gerçekleşir ve HTML'e gömülür.
 */
export function getT(
  tenantLocale: Locale,
): (key: string, options?: Record<string, unknown>) => string {
  const instance = getI18n(tenantLocale);
  return (key: string, options?: Record<string, unknown>) =>
    instance.t(key, options ?? {}) as string;
}
