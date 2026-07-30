/**
 * @file Ülke adaptörü public API.
 * @module @vetniva/api/common/adapters
 *
 * @description Adapter sözleşmesi, registry, TR ve GB
 * implementasyonlarının dışa aktarım noktası. Uygulama
 * katmanı yalnızca bu modülden import eder.
 *
 * @author GOAL-003 (FAZ-0 devamı)
 * @see docs/i18n/COUNTRY_ADAPTER_CONTRACT.md
 */

export type {
  Address,
  CountryAdapter,
  CountryCode,
  CurrencyCode,
  CurrencyFormatOptions,
  DateFormatOptions,
  DateTimeFormatOptions,
  NotificationRules,
  NumberFormatOptions,
  PercentFormatOptions,
  PhoneFormatOptions,
  TimeFormatOptions,
  ValidationResult,
  VatBreakdown,
  VatCategory,
  VatRate,
} from "./country-adapter.js";

export {
  getCountryAdapter,
  isCountrySupported,
  listSupportedCountries,
  registerCountryAdapter,
} from "./adapter.registry.js";

export { GbCountryAdapter } from "./gb-country.adapter.js";
export { TrCountryAdapter } from "./tr-country.adapter.js";
