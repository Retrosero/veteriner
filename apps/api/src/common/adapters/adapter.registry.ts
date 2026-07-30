/**
 * @file Ülke adaptörü registry.
 * @module @vetniva/api/common/adapters/registry
 *
 * @description Tenant.country'ye göre uygun adapter döner.
 * Singleton pattern; uygulama başlangıcında TR ve GB adapter'lar
 * kayıt edilir. Tenant bazlı override Faz 14+ ile eklenebilir.
 *
 * @author GOAL-003 (FAZ-0 devamı)
 */

import type { CountryAdapter, CountryCode } from "./country-adapter.js";
import { GbCountryAdapter } from "./gb-country.adapter.js";
import { TrCountryAdapter } from "./tr-country.adapter.js";

/**
 * Singleton adapter registry. Her ülke için bir adapter
 * örneği tutar.
 */
const registry = new Map<CountryCode, CountryAdapter>([
  ["TR", new TrCountryAdapter()],
  ["GB", new GbCountryAdapter()],
]);

/**
 * Ülke koduna göre uygun adapter'ı döner.
 *
 * @param country ISO 3166-1 alpha-2 ülke kodu
 * @returns Ülke adaptörü
 * @throws Desteklenmeyen ülke kodu için DomainError
 */
export function getCountryAdapter(country: CountryCode): CountryAdapter {
  const adapter = registry.get(country);
  if (!adapter) {
    throw new Error(
      `TR_COUNTRY_0001: Desteklenmeyen ülke adaptörü: ${country}. ` +
        `Desteklenen: ${Array.from(registry.keys()).join(", ")}`,
    );
  }
  return adapter;
}

/**
 * Yeni bir ülke adaptörü kayıt eder. Test ve plugin senaryoları
 * için kullanılır; üretimde sadece başlangıçta kayıt yapılır.
 *
 * @param country Ülke kodu
 * @param adapter Adapter implementasyonu
 */
export function registerCountryAdapter(
  country: CountryCode,
  adapter: CountryAdapter,
): void {
  registry.set(country, adapter);
}

/**
 * Kayıtlı tüm ülke kodlarını döner. Test ve admin panelleri
 * için kullanışlıdır.
 */
export function listSupportedCountries(): CountryCode[] {
  return Array.from(registry.keys());
}

/**
 * Verilen ülke kodunun desteklenip desteklenmediğini kontrol eder.
 */
export function isCountrySupported(country: string): country is CountryCode {
  return registry.has(country as CountryCode);
}
