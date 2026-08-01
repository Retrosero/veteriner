/**
 * @file Birleşik Krallık ülke adaptörü.
 * @module @vetniva/api/common/adapters/gb-country
 * @description GB ülkesi için pilot kapsamda TAM implementasyon.
 * HMRC (vergi), Ofcom (telefon numara planı), Royal Mail
 * (posta kodu), ISO 13616 (IBAN mod 97-10) kuralları.
 *
 * Pilot kapsamda formatlama (Intl API), doğrulama (regex +
 * checksum), KDV oranları (FAZ-141) ve reçete kuralları
 * (RCVS 28 gün) sağlanır.
 *
 * Faz 14+ kapsamda eklenecekler:
 * - MTD (Making Tax Digital) entegrasyonu
 * - Reverse charge (B2B KDV)
 * - POM-V reçete kategorisi (POM-V, POM-VPS, NFA-VPS)
 * - HMRC senkronizasyonu (vergili satışlar).
 * @author GOAL-003 (FAZ-0 iskelet) + GOAL-141 (FAZ-14 core)
 * @see docs/i18n/COUNTRY_ADAPTER_CONTRACT.md
 * @see docs/finance/GB_VAT.md
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
 * GB KDV oranları (FAZ-141 / HMRC Notice 709/3, 2024 itibarıyla).
 *
 * Standart %20, indirilmiş %0 (POM-V ilaç, pet food temel).
 * "service" kategorisi standart oran; pet_accessory da standart.
 * @see https://www.gov.uk/guidance/rates-of-vat-on-different-goods-and-services
 */
const GB_VAT_RATES: VatRate[] = [
  { category: "medicine", rate: 0.0, effectiveFrom: new Date("2024-01-01") },
  { category: "vaccine", rate: 0.0, effectiveFrom: new Date("2024-01-01") },
  { category: "pet_food", rate: 0.0, effectiveFrom: new Date("2024-01-01") },
  {
    category: "pet_accessory",
    rate: 0.2,
    effectiveFrom: new Date("2024-01-01"),
  },
  { category: "service", rate: 0.2, effectiveFrom: new Date("2024-01-01") },
  { category: "other", rate: 0.2, effectiveFrom: new Date("2024-01-01") },
];

/**
 * GB bildirim kuralları (UK GDPR + PECR uyumlu).
 *
 * - requiresOptIn: UK GDPR Madde 6/7 gereği pazarlama
 *   iletişimi için önceden açık rıza zorunlu.
 * - smsQuietHours: PECR + ICO rehberliği; 21:00-09:00
 *   arası pazarlama SMS'i gönderilmez.
 * - emailDailyLimit: Günde 3 e-posta; GDPR orantılılık.
 * - marketingConsentRequired: Pazarlama için ayrı onay
 *   (genel bildirim izninden bağımsız).
 */
const GB_NOTIFICATION_RULES: NotificationRules = {
  requiresOptIn: true,
  defaultOptIn: false,
  smsQuietHours: { start: "21:00", end: "09:00" },
  emailDailyLimit: 3,
  marketingConsentRequired: true,
};

/**
 * UK posta kodu regex'i (Royal Mail standardı).
 *
 * Format: 1-2 harfli alan kodu + 1-2 rakam/harf + opsiyonel
 * boşluk + 1 rakam + 2 harf.
 *
 * Örnekler: SW1A 1AA, M1 1AA, B33 8TH, CR2 6XH, DN55 1PT,
 * EC1A 1BB.
 * @see https://en.wikipedia.org/wiki/Postcodes_in_the_United_Kingdom
 */
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/;

/**
 * UK telefon numarası regex'i (E.164 +44 ile başlayan).
 *
 * Ofcom numara planına göre:
 * - Mobil: +44 7XXX XXXXXX (10 hane, 7 ile başlar)
 * - Sabit (coğrafi): +44 1XXX XXXXXX veya +44 2X XXXX XXXX.
 *
 * Toplam 13 karakter: +44 + 10 hane. Alan kodu (10X, 11X,
 * 12X, 20X, vb.) Ofcom tarafından tahsis edilir; burada
 * yaygın aralıkları kabul ediyoruz.
 */
const UK_PHONE_REGEX = /^\+44[127]\d{9}$/;

/**
 * UTR (Unique Taxpayer Reference) — bireysel vergi mükellefi
 * kimlik numarası. 10 haneli sayı.
 * @see https://www.gov.uk/find-lost-utr-number
 */
const UTR_REGEX = /^\d{10}$/;

/**
 * VRN (VAT Registration Number) — şirket KDV kayıt numarası.
 * HMRC formatı: GB + 9 hane = 11 karakter toplam.
 * @see https://www.gov.uk/vat-registration
 */
const VRN_REGEX = /^GB\d{9}$/;

/**
 * IBAN (ISO 13616) mod 97-10 doğrulaması — GB için.
 *
 * GB IBAN toplam 22 karakter: GB + 2 kontrol + 4 banka (BIC) +
 * 6 sort code + 8 hesap no.
 * @param iban Doğrulanacak IBAN (boşluklu veya boşluksuz).
 * @returns Geçerli ise true.
 */
function isValidGBIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (!/^GB\d{2}[A-Z]{4}\d{14}$/.test(cleaned)) {
    return false;
  }
  // İlk 4 karakteri sona taşı
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  // Harfleri sayıya çevir (A=10, B=11, ... Z=35)
  let numeric = "";
  for (const ch of rearranged) {
    if (ch >= "A" && ch <= "Z") {
      numeric += (ch.charCodeAt(0) - 55).toString();
    } else {
      numeric += ch;
    }
  }
  // Mod 97 hesapla (büyük sayılar için parça parça)
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

/**
 * UK telefon numarasını E.164 → okunabilir formata çevirir.
 *
 * +44 7XXX XXXXXX → +44 7XXX XXXXXX (zaten doğru ise olduğu gibi)
 * +447700900123 → +44 7700 900123.
 * @param phone E.164 formatında telefon (+44 ile başlayan).
 * @returns İnsan-okunabilir format.
 */
function formatUKPhoneDisplay(phone: string): string {
  // cleaned zaten +44 ile başlıyor ve 13 karakter
  if (phone.length === 13) {
    return `${phone.slice(0, 3)} ${phone.slice(3, 7)} ${phone.slice(7)}`;
  }
  return phone;
}

/**
 * GB adaptör implementasyonu. Pilot kapsamda formatlama +
 * doğrulama + KDV + reçete kuralları. Faz 14+'da MTD ve
 * HMRC senkronizasyonu eklenecek.
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
      // short: dd/MM/yyyy (en-GB default)
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
    const cleaned = phone.replace(/\s/g, "");
    if (UK_PHONE_REGEX.test(cleaned)) {
      return formatUKPhoneDisplay(cleaned);
    }
    return phone;
  }

  validatePhone(phone: string): ValidationResult {
    const cleaned = phone.replace(/\s/g, "");
    if (UK_PHONE_REGEX.test(cleaned)) {
      return { valid: true, normalized: formatUKPhoneDisplay(cleaned) };
    }
    return {
      valid: false,
      error: "validation.phone.invalid_gb",
    };
  }

  // -- Posta kodu --

  formatPostalCode(code: string): string {
    const compact = code.toUpperCase().replace(/\s+/g, "").trim();
    return compact.replace(/^(.+?)(\d[A-Z]{2})$/, "$1 $2");
  }

  validatePostalCode(code: string): ValidationResult {
    const compact = code.toUpperCase().replace(/\s+/g, "").trim();
    if (UK_POSTCODE_REGEX.test(compact)) {
      // Outward + inward code'u normalize et (orta boşluk)
      const normalized = compact.replace(/^(.+?)(\d[A-Z]{2})$/, "$1 $2");
      return { valid: true, normalized };
    }
    return {
      valid: false,
      error: "validation.postal_code.invalid_gb",
    };
  }

  // -- Vergi --

  formatTaxId(taxId: string): string {
    return taxId.toUpperCase().replace(/\s/g, "").trim();
  }

  validateTaxId(taxId: string, type: "company" | "personal"): ValidationResult {
    const cleaned = taxId.toUpperCase().replace(/\s/g, "").trim();
    if (type === "company") {
      // VRN: GB + 9 hane
      if (VRN_REGEX.test(cleaned)) {
        return { valid: true, normalized: cleaned };
      }
      return { valid: false, error: "validation.tax_id.vrn_invalid" };
    }
    // UTR: 10 hane sayı
    if (UTR_REGEX.test(cleaned)) {
      return { valid: true, normalized: cleaned };
    }
    return { valid: false, error: "validation.tax_id.utr_invalid" };
  }

  // -- IBAN --

  formatIBAN(iban: string): string {
    return (
      iban
        .replace(/\s/g, "")
        .toUpperCase()
        .match(/.{1,4}/g)
        ?.join(" ") ?? iban
    );
  }

  validateIBAN(iban: string): ValidationResult {
    const cleaned = iban.replace(/\s/g, "").toUpperCase();
    if (!cleaned.startsWith("GB")) {
      return { valid: false, error: "validation.iban.country_mismatch" };
    }
    if (cleaned.length !== 22) {
      return { valid: false, error: "validation.iban.length_invalid" };
    }
    if (!isValidGBIBAN(cleaned)) {
      return { valid: false, error: "validation.iban.checksum_invalid" };
    }
    return { valid: true, normalized: cleaned };
  }

  // -- KDV --

  getVatRates(): VatRate[] {
    return [...GB_VAT_RATES];
  }

  getVatRateFor(category: VatCategory, date: Date): number {
    const applicable = GB_VAT_RATES.filter(
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
    return 28; // UK'de 28 gün (RCVS standart)
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
    return { ...GB_NOTIFICATION_RULES };
  }
}
