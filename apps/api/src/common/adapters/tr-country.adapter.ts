/**
 * @file Türkiye ülke adaptörü.
 * @module @vetniva/api/common/adapters/tr-country
 *
 * @description TR ülkesi için tam implementasyon. Tarih, saat,
 * para, sayı, telefon (E.164), VKN/TCKN doğrulama, KDV
 * oranları (TR 2026), fiş formatı, reçete kuralları, KVKK
 * bildirim kuralları.
 *
 * Pilot kapsamda TAM implementasyon. Yeni KDV oranı veya
 * mevzuat değişikliği olduğunda güncellenir.
 *
 * @author GOAL-003 (FAZ-0 devamı)
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

/**
 * VKN (Vergi Kimlik Numarası) doğrulama algoritması.
 *
 * Türkiye'de 10 haneli VKN, son hanesi (10. hane) bir
 * kontrol hanesidir. İlk 9 hane, her biri kendi
 * ağırlığıyla (10, 9, 8, 7, 6, 5, 4, 3, 2) çarpılır;
 * her çarpımın 10'a bölümünden kalan toplanır; toplamın
 * 10'a bölümünden kalan, 10. hane ise doğrudur.
 *
 * @param vkn 10 haneli VKN
 * @returns Geçerli ise true
 */
function isValidVKN(vkn: string): boolean {
  if (!/^\d{10}$/.test(vkn)) return false;
  const digits = vkn.split("").map(Number);
  if (digits.length !== 10) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = digits.at(i);
    if (d === undefined) return false;
    const weighted = (d * Math.pow(2, 9 - i)) % 10;
    sum += weighted;
  }
  const lastDigit = digits[9];
  if (lastDigit === undefined) return false;
  const checkDigit = sum % 10 === 0 ? 0 : 10 - (sum % 10);
  return checkDigit === lastDigit;
}

/**
 * TCKN (T.C. Kimlik Numarası) doğrulama algoritması.
 *
 * 11 haneli TCKN, son 2 hanesi kontrol haneleridir:
 * - 10. hane = (ilk 9 hanenin (1,3,5,7,9) tek basamaklar
 *   toplamı × 7 - (2,4,6,8) çift basamaklar toplamı) mod 10
 * - 11. hane = (ilk 10 hanenin toplamı) mod 10
 *
 * @param tckn 11 haneli TCKN
 * @returns Geçerli ise true
 */
function isValidTCKN(tckn: string): boolean {
  if (!/^\d{11}$/.test(tckn)) return false;
  const digits = tckn.split("").map(Number);
  if (digits.length !== 11) return false;
  if (digits[0] === undefined || digits[0] === 0) return false; // İlk hane 0 olamaz

  // 10. hane kontrolü
  const oddSum =
    (digits[0] ?? 0) +
    (digits[2] ?? 0) +
    (digits[4] ?? 0) +
    (digits[6] ?? 0) +
    (digits[8] ?? 0);
  const evenSum =
    (digits[1] ?? 0) + (digits[3] ?? 0) + (digits[5] ?? 0) + (digits[7] ?? 0);
  const tenthDigit = (oddSum * 7 - evenSum) % 10;
  const tenthActual = digits[9];
  if (tenthDigit !== tenthActual) return false;

  // 11. hane kontrolü
  const firstTenSum = digits.slice(0, 10).reduce((acc, d) => acc + (d ?? 0), 0);
  const eleventhDigit = firstTenSum % 10;
  const eleventhActual = digits[10];
  return eleventhDigit === eleventhActual;
}

/**
 * IBAN (ISO 13616) mod 97-10 doğrulaması.
 * TR IBAN: TR + 2 kontrol + 22 hane = 26 hane toplam.
 */
function isValidIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return false;
  // Ülke kodu + kontrol: 2 harf + 2 rakam = ilk 4 karakter
  if (!/^[A-Z]{2}\d{2}/.test(cleaned)) return false;
  // İlk 4 karakteri sona taşı, harfleri sayıya çevir (A=10, B=11, ...)
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  let numeric = "";
  for (const ch of rearranged) {
    if (ch >= "A" && ch <= "Z") {
      numeric += (ch.charCodeAt(0) - 55).toString();
    } else {
      numeric += ch;
    }
  }
  // Mod 97 hesapla (büyük sayılar için parça parça hesap)
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

/**
 * Türkiye KDV oranları (2026 itibarıyla).
 *
 * Bu oranlar Resmi Gazete değişikliklerine göre güncellenmelidir.
 * `effectiveFrom` ile tarihsel geçiş korunur.
 */
const TR_VAT_RATES: VatRate[] = [
  { category: "medicine", rate: 0.08, effectiveFrom: new Date("2024-01-01") },
  { category: "vaccine", rate: 0.08, effectiveFrom: new Date("2024-01-01") },
  { category: "pet_food", rate: 0.1, effectiveFrom: new Date("2024-01-01") },
  {
    category: "pet_accessory",
    rate: 0.2,
    effectiveFrom: new Date("2024-01-01"),
  },
  { category: "service", rate: 0.2, effectiveFrom: new Date("2024-01-01") },
  { category: "other", rate: 0.2, effectiveFrom: new Date("2024-01-01") },
];

/**
 * TR bildirim kuralları (KVKK uyumlu).
 */
const TR_NOTIFICATION_RULES: NotificationRules = {
  requiresOptIn: true, // KVKK Madde 5/6 — açık rıza
  defaultOptIn: false, // Varsayılan opt-in yok
  smsQuietHours: { start: "22:00", end: "08:00" }, // Gece SMS yasak
  emailDailyLimit: 5, // Kullanıcı başına günde max 5 e-posta
  marketingConsentRequired: true, // Pazarlama için ayrı onay
};

/**
 * TR adaptör implementasyonu. Türkiye için tüm ülke kurallarını
 * uygular; pilot kapsamda tam implementasyon.
 */
export class TrCountryAdapter implements CountryAdapter {
  readonly code: CountryCode = "TR";
  readonly currency: CurrencyCode = "TRY";
  readonly locale = "tr-TR";
  readonly timezone = "Europe/Istanbul";

  // -- Formatlama --

  formatDate(date: Date, options: DateFormatOptions = {}): string {
    const style = options.style ?? "short";
    const intlOptions: Intl.DateTimeFormatOptions = {
      timeZone: this.timezone,
    };
    if (style === "short") {
      intlOptions.day = "2-digit";
      intlOptions.month = "2-digit";
      intlOptions.year = "numeric";
    } else if (style === "medium") {
      intlOptions.day = "numeric";
      intlOptions.month = "long";
      intlOptions.year = "numeric";
    } else if (style === "long") {
      intlOptions.day = "numeric";
      intlOptions.month = "long";
      intlOptions.year = "numeric";
      intlOptions.weekday = "long";
    } else {
      intlOptions.day = "numeric";
      intlOptions.month = "long";
      intlOptions.year = "numeric";
      intlOptions.weekday = "long";
    }
    if (options.includeYear === false) {
      delete intlOptions.year;
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

  formatDateTime(date: Date, options: DateTimeFormatOptions = {}): string {
    return `${this.formatDate(date, options)} ${this.formatTime(date, options)}`;
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
    const v = options.isFraction === false ? value : value * 100;
    return new Intl.NumberFormat(this.locale, {
      style: "percent",
      minimumFractionDigits: options.fractionDigits ?? 0,
      maximumFractionDigits: options.fractionDigits ?? 0,
    }).format(options.isFraction === false ? v / 100 : v / 100);
  }

  // -- Alan formatları --

  formatPhone(phone: string, options: PhoneFormatOptions = {}): string {
    const cleaned = phone.replace(/\s/g, "");
    // E.164: +90 ile başlıyorsa
    if (cleaned.startsWith("+90") && cleaned.length === 13) {
      const local = cleaned.slice(3); // 10 hane
      const op = local.slice(0, 3); // operatör kodu
      const part1 = local.slice(3, 6);
      const part2 = local.slice(6, 8);
      const part3 = local.slice(8, 10);
      if (options.international === false) {
        return `0${op} ${part1} ${part2} ${part3}`;
      }
      return `+90 ${op} ${part1} ${part2} ${part3}`;
    }
    return phone;
  }

  validatePhone(phone: string): ValidationResult {
    const cleaned = phone.replace(/\s/g, "");
    if (/^\+90[5]\d{9}$/.test(cleaned)) {
      return { valid: true, normalized: cleaned };
    }
    return {
      valid: false,
      error: "validation.phone.invalid_tr",
    };
  }

  formatPostalCode(code: string): string {
    return code.replace(/\D/g, "").slice(0, 5);
  }

  validatePostalCode(code: string): ValidationResult {
    const cleaned = code.replace(/\s/g, "");
    if (/^\d{5}$/.test(cleaned)) {
      return { valid: true, normalized: cleaned };
    }
    return {
      valid: false,
      error: "validation.postal_code.invalid_tr",
    };
  }

  formatTaxId(taxId: string): string {
    const cleaned = taxId.replace(/\s/g, "");
    if (cleaned.length === 10) {
      return `${cleaned.slice(0, 9)} ${cleaned.slice(9)}`; // VKN
    }
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 10)} ${cleaned.slice(10)}`; // TCKN
    }
    return taxId;
  }

  validateTaxId(taxId: string, type: "company" | "personal"): ValidationResult {
    const cleaned = taxId.replace(/\s/g, "");
    if (type === "company") {
      if (isValidVKN(cleaned)) return { valid: true, normalized: cleaned };
      return { valid: false, error: "validation.tax_id.vkn_invalid" };
    }
    if (isValidTCKN(cleaned)) return { valid: true, normalized: cleaned };
    return { valid: false, error: "validation.tax_id.tckn_invalid" };
  }

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
    if (!cleaned.startsWith("TR")) {
      return { valid: false, error: "validation.iban.country_mismatch" };
    }
    if (cleaned.length !== 26) {
      return { valid: false, error: "validation.iban.length_invalid" };
    }
    if (!isValidIBAN(cleaned)) {
      return { valid: false, error: "validation.iban.checksum_invalid" };
    }
    return { valid: true, normalized: cleaned };
  }

  // -- Vergi/KDV --

  getVatRates(): VatRate[] {
    return [...TR_VAT_RATES];
  }

  getVatRateFor(category: VatCategory, date: Date): number {
    const applicable = TR_VAT_RATES.filter(
      (r) =>
        r.category === category &&
        r.effectiveFrom <= date &&
        (r.effectiveTo === undefined || r.effectiveTo >= date),
    );
    // En yeni geçerli oranı al
    if (applicable.length === 0) {
      // Kategori bulunamadıysa "other" oranını kullan
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

  // -- Belge / Fiş --

  formatReceiptNumber(sequence: number, prefix?: string): string {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const seq = String(sequence).padStart(4, "0");
    return `${prefix ?? "FIS"}${year}${month}-${seq}`;
  }

  getInvoiceSeriesPrefix(): string {
    return "FTR"; // Fatura TR
  }

  // -- Reçete --

  formatPrescriptionNumber(sequence: number, year: number): string {
    const seq = String(sequence).padStart(5, "0");
    return `R${year}-${seq}`;
  }

  getPrescriptionValidityDays(): number {
    return 30;
  }

  // -- Adres --

  formatAddress(address: Address): string {
    const lines = [
      address.line1,
      address.line2,
      `${address.postalCode} ${address.city}`,
      "Türkiye",
    ].filter(Boolean);
    return lines.join("\n");
  }

  // -- Bildirim --

  getNotificationRules(): NotificationRules {
    return { ...TR_NOTIFICATION_RULES };
  }
}
