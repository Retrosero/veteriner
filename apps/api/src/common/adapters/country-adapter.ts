/**
 * @file Ülke adaptörü arayüzü.
 * @module @vetniva/api/common/adapters/country-adapter
 *
 * @description VetNiva'nın ülke bazlı iş kuralları için adaptör
 * sözleşmesi. Tarih, saat, para, sayı, telefon, vergi, KDV,
 * fiş, reçete ve bildirim kuralları bu arayüz üzerinden yönetilir.
 *
 * Bu sözleşme, kod içine dağınık `if country === 'TR'`
 * kontrollerini engeller. Her ülke için ayrı implementasyon
 * (TR tam, GB iskelet) runtime'da tenant.country'ye göre
 * seçilir.
 *
 * @security Tenant.country alanı tenant oluşturulurken
 *   SUPERADMIN tarafından seçilir ve sonradan değiştirilemez.
 *   Adapter seçimi bu alana göre yapılır.
 *
 * @author GOAL-003 (FAZ-0 devamı) ülke adaptörü sözleşmesi
 * @see docs/i18n/COUNTRY_ADAPTER_CONTRACT.md
 */

import type { Decimal } from "@prisma/client/runtime/library";

/**
 * Desteklenen ülke kodları. ISO 3166-1 alpha-2 (2 harf).
 * Yeni ülke eklemek için bu union'a ekleyip yeni adapter
 * implementasyonu (`<ülke>-country.adapter.ts`) oluşturun.
 */
export type CountryCode = "TR" | "GB";

/**
 * Uluslararası para birimi kodları (ISO 4217). Her ülkenin
 * kendi para birimi vardır; `formatCurrency` bu kodu kullanır.
 */
export type CurrencyCode = "TRY" | "GBP" | "USD" | "EUR";

/**
 * Adres yapısı. Ülke adaptörü `formatAddress` ile bunu
 * ülke formatına göre string'e dönüştürür.
 */
export type Address = {
  line1: string;
  line2?: string | undefined;
  city: string;
  state?: string | undefined;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
};

/**
 * Tarih formatlama seçenekleri.
 */
export type DateFormatOptions = {
  /** Uzunluk: short (1 Tem 2026), medium (1 Temmuz 2026), long (1 Temmuz 2026 Cuma), full (Cuma, 1 Temmuz 2026) */
  style?: "short" | "medium" | "long" | "full";
  /** Mevcut yıldan farklı yıl için ayraç (default true). */
  includeYear?: boolean;
};

/**
 * Saat formatlama seçenekleri.
 */
export type TimeFormatOptions = {
  /** 12-saat formatı (2:30 pm) veya 24-saat (14:30). */
  hour12?: boolean;
  /** Saniye gösterimi. */
  showSeconds?: boolean;
};

/**
 * Tarih+saat formatlama seçenekleri.
 */
export type DateTimeFormatOptions = DateFormatOptions &
  TimeFormatOptions;

/**
 * Para formatlama seçenekleri.
 */
export type CurrencyFormatOptions = {
  /** Sembol gösterimi (varsayılan true). */
  showSymbol?: boolean;
  /** Belirli para birimi kodu (varsayılan adapter.currency). */
  currency?: CurrencyCode;
  /** Ondalık hane sayısı (varsayılan 2). */
  fractionDigits?: number;
};

/**
 * Sayı formatlama seçenekleri.
 */
export type NumberFormatOptions = {
  /** Minimum ondalık hane. */
  minimumFractionDigits?: number;
  /** Maksimum ondalık hane. */
  maximumFractionDigits?: number;
};

/**
 * Yüzde formatlama seçenekleri.
 */
export type PercentFormatOptions = {
  /** 0-1 arası mı, 0-100 arası mı? (default true: 0-1). */
  isFraction?: boolean;
  /** Ondalık hane sayısı (varsayılan 0). */
  fractionDigits?: number;
};

/**
 * Telefon formatlama seçenekleri.
 */
export type PhoneFormatOptions = {
  /** Ülke kodu öneki (varsayılan adapter.code). */
  countryCode?: CountryCode;
  /** Uluslararası format (varsayılan true). */
  international?: boolean;
};

/**
 * Doğrulama sonucu. `valid: false` durumunda `error` alanı
 * i18n anahtarı içerir; frontend bu anahtarı kullanıcıya
 * göstermek için kullanır.
 */
export type ValidationResult = {
  valid: boolean;
  /** Hata kodu (i18n anahtarı). */
  error?: string;
  /** Doğrulanmış/normalleştirilmiş değer. */
  normalized?: string;
};

/**
 * KDV kategorisi. Her ülkenin kategoriye göre farklı oranı
 * olabilir (ör. TR'de ilaç %8, GB'de %0).
 */
export type VatCategory =
  | "medicine" // Beşeri ilaç (veteriner ilaç için Faz 14'te detay)
  | "vaccine" // Aşı
  | "pet_food" // Petshop gıda
  | "pet_accessory" // Aksesuar
  | "service" // Klinik hizmeti (muayene, ameliyat)
  | "other";

/**
 * Tek bir KDV oranı tanımı. Resmi Gazete / HMRC duyuruları ile
 * yeni oranlar eklenebilir; `effectiveFrom`/`effectiveTo`
 * alanları tarihsel geçiş için kullanılır.
 */
export type VatRate = {
  category: VatCategory;
  /** Oran (0.20 = %20). */
  rate: number;
  effectiveFrom: Date;
  effectiveTo?: Date | undefined;
};

/**
 * KDV hesaplama sonucu.
 */
export type VatBreakdown = {
  net: Decimal;
  vat: Decimal;
  gross: Decimal;
  rate: number;
};

/**
 * Bildirim kuralları. KVKK/GDPR uyumu, SMS saat kısıtı, e-posta
 * limiti gibi ülkeye özel kurallar.
 */
export type NotificationRules = {
  /** KVKK/GDPR uyumu için önceden opt-in gerekli mi? */
  requiresOptIn: boolean;
  /** Yeni kullanıcılar için varsayılan opt-in durumu. */
  defaultOptIn: boolean;
  /** SMS için gece yasağı (saat dilimi adapter.locale). */
  smsQuietHours: { start: string; end: string };
  /** E-posta için günlük maksimum gönderim (kullanıcı başına). */
  emailDailyLimit?: number;
  /** Pazarlama iletişimi için ek onay gerekiyor mu? */
  marketingConsentRequired: boolean;
};

/**
 * Ülke adaptörü ana arayüzü. Her ülke için bir implementasyon
 * (`TrCountryAdapter`, `GbCountryAdapter`, vb.) bu arayüzü
 * uygular.
 *
 * Implementasyon dosyaları:
 * - `tr-country.adapter.ts` (TR, tam)
 * - `gb-country.adapter.ts` (GB, iskelet)
 *
 * @example
 * ```ts
 * const adapter = getCountryAdapter(tenant.country);
 * const formatted = adapter.formatCurrency(1234.56); // TR: "₺1.234,56"
 * const phone = adapter.formatPhone("+905321234567");
 * ```
 */
export interface CountryAdapter {
  /** Ülke kodu (ör. "TR", "GB"). */
  readonly code: CountryCode;

  /** Para birimi kodu (ISO 4217). */
  readonly currency: CurrencyCode;

  /** Yerel ayar (Intl locale, ör. "tr-TR", "en-GB"). */
  readonly locale: string;

  /** Saat dilimi (IANA, ör. "Europe/Istanbul"). */
  readonly timezone: string;

  // -- Formatlama --

  /**
   * Tarihi ülke formatına göre formatlar.
   * @param date Formatlanacak tarih
   * @param options Formatlama seçenekleri
   * @returns Formatlanmış tarih string'i
   */
  formatDate(date: Date, options?: DateFormatOptions): string;

  /**
   * Saati ülke formatına göre formatlar.
   */
  formatTime(date: Date, options?: TimeFormatOptions): string;

  /**
   * Tarih+saat kombinasyonu.
   */
  formatDateTime(date: Date, options?: DateTimeFormatOptions): string;

  /**
   * Para birimini ülke formatına göre formatlar.
   */
  formatCurrency(
    amount: number | Decimal | string,
    options?: CurrencyFormatOptions,
  ): string;

  /**
   * Sayıyı ülke formatına göre formatlar.
   */
  formatNumber(value: number, options?: NumberFormatOptions): string;

  /**
   * Yüzde.
   */
  formatPercent(value: number, options?: PercentFormatOptions): string;

  // -- Alan formatları --

  /**
   * Telefon numarasını ülke formatına göre formatlar.
   */
  formatPhone(phone: string, options?: PhoneFormatOptions): string;

  /**
   * Telefon numarası doğrulaması (ülke kurallarına göre).
   */
  validatePhone(phone: string): ValidationResult;

  /**
   * Posta kodu formatlaması.
   */
  formatPostalCode(code: string): string;

  /**
   * Posta kodu doğrulaması.
   */
  validatePostalCode(code: string): ValidationResult;

  /**
   * Vergi numarası formatı (TR: VKN/TCKN, GB: UTR/VRN).
   */
  formatTaxId(taxId: string): string;

  /**
   * Vergi numarası doğrulaması.
   * @param taxId Doğrulanacak numara
   * @param type "company" (şirket) veya "personal" (kişi)
   */
  validateTaxId(
    taxId: string,
    type: "company" | "personal",
  ): ValidationResult;

  /**
   * IBAN formatı.
   */
  formatIBAN(iban: string): string;

  /**
   * IBAN doğrulaması (mod 97-10).
   */
  validateIBAN(iban: string): ValidationResult;

  // -- Vergi/KDV --

  /**
   * Ülkenin tüm KDV oranları listesi.
   */
  getVatRates(): VatRate[];

  /**
   * Belirli bir tarih ve kategori için güncel KDV oranı.
   */
  getVatRateFor(category: VatCategory, date: Date): number;

  /**
   * KDV tutarını hesaplar (KDV hariç → KDV dahil).
   */
  calculateVat(netAmount: Decimal, rate: number): VatBreakdown;

  // -- Belge / Fiş --

  /**
   * Fiş/fatura numarası formatı.
   */
  formatReceiptNumber(sequence: number, prefix?: string): string;

  /**
   * Fatura seri prefix'i.
   */
  getInvoiceSeriesPrefix(): string;

  // -- Reçete (veteriner) --

  /**
   * Reçete numarası formatı.
   */
  formatPrescriptionNumber(sequence: number, year: number): string;

  /**
   * Reçete geçerlilik süresi (gün).
   */
  getPrescriptionValidityDays(): number;

  // -- Adres --

  /**
   * Adresi ülke formatına göre formatlar.
   */
  formatAddress(address: Address): string;

  // -- Bildirim --

  /**
   * Ülkeye özel bildirim kuralları (KVKK/GDPR).
   */
  getNotificationRules(): NotificationRules;
}
