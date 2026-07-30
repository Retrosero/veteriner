/**
 * @file Birleşik Krallık ülke adaptörü (iskelet).
 * @module @vetniva/api/common/adapters/gb-country
 *
 * @description GB ülkesi için İSKELET implementasyon. Gerçek
 * mevzuat (RCVS, VMD, HMRC MTD, BVA standartları, GDPR/PECR
 * detayları) Faz 14'te (en-GB pazarı açılışı) tamamlanacak.
 *
 * Pilot kapsamda yalnızca temel formatlama (Intl API) sağlanır;
 * vergi, reçete, belge formatları placeholder.
 *
 * @author GOAL-003 (FAZ-0 devamı) iskelet
 * @see docs/i18n/COUNTRY_ADAPTER_CONTRACT.md
 */

import { Decimal } from "@prisma/client/runtime/library";

import type {
  Address,
  CountryAdapter,
  CountryCode,
  CurrencyCode,
  CurrencyFormatOptions,
  DateFormatOptions,
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

/**
 * GB placeholder KDV oranları. Faz 14'te HMRC ile uyumlu
 * detaylı oran listesi gelecek.
 */
const GB_VAT_RATES_PLACEHOLDER: VatRate[] = [
  { category: "medicine", rate: 0.0, effectiveFrom: new Date("2024-01-01") },
  { category: "vaccine", rate: 0.0, effectiveFrom: new Date("2024-01-01") },
  { category: "pet_food", rate: 0.0, effectiveFrom: new Date("2024-01-01") },
  { category: "pet_accessory", rate: 0.2, effectiveFrom: new Date("2024-01-01") },
  { category: "service", rate: 0.2, effectiveFrom: new Date("2024-01-01") },
  { category: "other", rate: 0.2, effectiveFrom: new Date("2024-01-01") },
];

/**
 * GB placeholder bildirim kuralları. Faz 14'te GDPR + PECR
 * detayları eklenecek.
 */
const GB_NOTIFICATION_RULES_PLACEHOLDER: NotificationRules = {
  requiresOptIn: true, // GDPR Madde 6/7 — açık rıza
  defaultOptIn: false,
  smsQuietHours: { start: "21:00", end: "09:00" }, // Yaz saati uygulanmaz
  emailDailyLimit: 3, // GDPR uyumlu, daha düşük limit
  marketingConsentRequired: true, // PECR — pazarlama için soft opt-in
};

/**
 * GB adaptör iskeleti. Faz 14'te HMRC, RCVS, VMD, BVA
 * standartlarına göre genişletilecek.
 */
export class GbCountryAdapter implements CountryAdapter {
  readonly code: CountryCode = "GB";
  readonly currency: CurrencyCode = "GBP";
  readonly locale = "en-GB";
  readonly timezone = "Europe/London";

  // -- Formatlama (Intl API ile) --

  formatDate(date: Date, options: DateFormatOptions = {}): string {
    const intlOptions: Intl.DateTimeFormatOptions = {
      timeZone: this.timezone,
    };
    if (options.style === "long" || options.style === "full") {
      intlOptions.weekday = "long";
      intlOptions.day = "numeric";
      intlOptions.month = "long";
      intlOptions.year = "numeric";
    } else if (options.style === "medium") {
      intlOptions.day = "numeric";
      intlOptions.month = "long";
      intlOptions.year = "numeric";
    } else {
      intlOptions.day = "2-digit";
      intlOptions.month = "2-digit";
      intlOptions.year = "numeric";
    }
    return new Intl.DateTimeFormat(this.locale, intlOptions).format(date);
  }

  formatTime(date: Date, options: TimeFormatOptions = {}): string {
    return new Intl.DateTimeFormat(this.locale, {
      timeZone: this.timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: options.showSeconds ? "2-digit" : undefined,
      hour12: options.hour12 ?? false,
    }).format(date);
  }

  formatDateTime(date: Date): string {
    return `${this.formatDate(date)} ${this.formatTime(date)}`;
  }

  formatCurrency(
    amount: number | Decimal | string,
    options: CurrencyFormatOptions = {},
  ): string {
    const value =
      typeof amount === "string"
        ? Number(amount)
        : amount instanceof Decimal
          ? amount.toNumber()
          : amount;
    return new Intl.NumberFormat(this.locale, {
      style: "currency",
      currency: options.currency ?? this.currency,
      minimumFractionDigits: options.fractionDigits ?? 2,
      maximumFractionDigits: options.fractionDigits ?? 2,
    }).format(value);
  }

  formatNumber(value: number, options: NumberFormatOptions = {}): string {
    return new Intl.NumberFormat(this.locale, {
      minimumFractionDigits: options.minimumFractionDigits,
      maximumFractionDigits: options.maximumFractionDigits,
    }).format(value);
  }

  formatPercent(value: number, options: PercentFormatOptions = {}): string {
    return new Intl.NumberFormat(this.locale, {
      style: "percent",
      minimumFractionDigits: options.fractionDigits ?? 0,
      maximumFractionDigits: options.fractionDigits ?? 0,
    }).format(value);
  }

  // -- Telefon --

  formatPhone(phone: string, _options: PhoneFormatOptions = {}): string {
    // TODO (Faz 14): Ofcom numara planına göre detaylı formatlama.
    const cleaned = phone.replace(/\s/g, "");
    if (cleaned.startsWith("+44")) {
      return cleaned.replace(/(\+44)(\d{4})(\d{6})/, "$1 $2 $3");
    }
    return phone;
  }

  validatePhone(_phone: string): ValidationResult {
    // TODO (Faz 14): Ofcom kurallarına göre detaylı doğrulama.
    return {
      valid: true,
      error: "validation.phone.gb_not_implemented",
    };
  }

  // -- Posta kodu --

  formatPostalCode(code: string): string {
    return code.toUpperCase().trim();
  }

  validatePostalCode(_code: string): ValidationResult {
    // TODO (Faz 14): UK posta kodu regex
    // (örn. SW1A 1AA, M1 1AA, B33 8TH).
    return {
      valid: true,
      error: "validation.postal_code.gb_not_implemented",
    };
  }

  // -- Vergi --

  formatTaxId(taxId: string): string {
    return taxId.toUpperCase().trim();
  }

  validateTaxId(_taxId: string, _type: "company" | "personal"): ValidationResult {
    // TODO (Faz 14): UTR (Unique Taxpayer Reference, 10 hane)
    // ve VRN (VAT Registration Number, GB + 9 hane) doğrulama.
    return {
      valid: true,
      error: "validation.tax_id.gb_not_implemented",
    };
  }

  // -- IBAN --

  formatIBAN(iban: string): string {
    return iban
      .replace(/\s/g, "")
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(" ") ?? iban;
  }

  validateIBAN(_iban: string): ValidationResult {
    // TODO (Faz 14): GB IBAN mod 97-10 doğrulaması.
    return {
      valid: true,
      error: "validation.iban.gb_not_implemented",
    };
  }

  // -- KDV --

  getVatRates(): VatRate[] {
    return [...GB_VAT_RATES_PLACEHOLDER];
  }

  getVatRateFor(category: VatCategory, date: Date): number {
    const applicable = GB_VAT_RATES_PLACEHOLDER.filter(
      (r) =>
        r.category === category &&
        r.effectiveFrom <= date &&
        (r.effectiveTo === undefined || r.effectiveTo >= date),
    );
    if (applicable.length === 0) {
      return this.getVatRateFor("other", date);
    }
    return applicable[applicable.length - 1]!.rate;
  }

  calculateVat(netAmount: Decimal, rate: number): VatBreakdown {
    const net = netAmount;
    const vat = net.mul(rate);
    const gross = net.add(vat);
    return { net, vat, gross, rate };
  }

  // -- Belge --

  formatReceiptNumber(sequence: number, prefix?: string): string {
    const year = new Date().getFullYear();
    const seq = String(sequence).padStart(4, "0");
    return `${prefix ?? "GB-REC"}${year}-${seq}`;
  }

  getInvoiceSeriesPrefix(): string {
    return "GB-INV";
  }

  // -- Reçete --

  formatPrescriptionNumber(sequence: number, year: number): string {
    const seq = String(sequence).padStart(5, "0");
    return `GB-Rx${year}-${seq}`;
  }

  getPrescriptionValidityDays(): number {
    return 28; // UK'de 28 gün (veteriner reçeteleri)
  }

  // -- Adres --

  formatAddress(address: Address): string {
    const lines = [
      address.line1,
      address.line2,
      `${address.city}${address.postalCode ? `, ${address.postalCode}` : ""}`,
      "United Kingdom",
    ].filter(Boolean);
    return lines.join("\n");
  }

  // -- Bildirim --

  getNotificationRules(): NotificationRules {
    return { ...GB_NOTIFICATION_RULES_PLACEHOLDER };
  }
}
