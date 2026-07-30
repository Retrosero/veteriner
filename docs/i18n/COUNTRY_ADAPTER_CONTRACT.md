# @file Ülke Adaptörü Sözleşmesi.
# @module docs/i18n/COUNTRY_ADAPTER_CONTRACT
#
# @description VetNiva'nın ülke bazlı iş kuralları için
# adapter sözleşmesi. TR ve GB ülkeleri için adaptör
# arayüzleri; tarih, saat, para, sayı, adres, telefon,
# vergi, belge, reçete ve bildirim kuralları.
#
# Bu sözleşme, kod içine dağınık `if country === 'TR'`
# kontrollerini engeller. Her ülke için ayrı adapter
# implementasyonu, runtime'da tenant.country'ye göre
# seçilir.
#
# @author GOAL-003 (FAZ-0 devamı) ülke adaptörü sözleşmesi
# @since 2026-07-30
# @security Tenant.country alanı tenant oluşturulurken
#   SUPERADMIN tarafından seçilir ve sonradan
#   değiştirilemez. Adapter seçimi bu alana göre
#   yapılır; kullanıcı UI dili (locale) farklı olabilir
#   (ör. `en-GB` UI + `TR` country).
# =============================================================================

# Ülke Adaptörü Sözleşmesi

VetNiva, farklı ülkelerin farklı iş kurallarını (vergi, para,
adres, telefon, reçete formatı, vb.) **kod içine dağınık
koşullarla değil**, **adaptör deseniyle** yönetir.

Bu doküman, hedef ülkeler (TR, GB) için adaptör sözleşmesini
ve mevcut pilot kapsamda (yalnızca TR) desteklenen
kuralları tanımlar. İngiltere (GB) için bu goal'da yalnızca
**iskelet** oluşturulur; gerçek mevzuat implementasyonu
Faz 14'te (en-GB pazarı) yapılır.

## 1. Neden Adaptör?

Adaptör deseni, şu sorunları çözer:

1. **Kod tekrarı:** Aynı tarih/saat formatlaması 50 yerde
   tekrarlanmaz; tek `adapter.formatDate()` çağrısı yeter.
2. **Test edilebilirlik:** Her adapter ayrı test edilir.
   Tarih formatını değiştirmek için tek bir yeri değiştirmek
   yeterlidir.
3. **Genişleyebilirlik:** Yeni ülke eklemek için yeni
   adapter dosyası oluşturulur; mevcut kod etkilenmez.
4. **Okunabilirlik:** `adapter.formatCurrency(1234)` açık
   ve anlaşılır; `formatCurrency(1234, 'TR', 'tr-TR')`
   karışık ve hataya açık.
5. **Tenant özelleştirmesi:** İleride tenant bazlı
   override (örn. bazı Türkiye klinikleri İngilizce fiş
   isterse) adapter'ın `tenant_id` parametresi ile
   mümkün olur.

## 2. Mimari

Adapter sözleşmesi `apps/api/src/common/adapters/` altında
yaşar. Her ülke için ayrı implementasyon dosyası vardır.
Runtime'da tenant'ın `country` alanına göre uygun adapter
seçilir.

```
apps/api/src/common/adapters/
├── country-adapter.ts          # Ana interface
├── tr-country.adapter.ts        # TR implementasyonu
├── gb-country.adapter.ts        # GB iskelet
├── adapter.registry.ts          # Factory/registry
├── adapter.module.ts            # NestJS module
├── index.ts                     # Public API
└── adapter.spec.ts              # Testler
```

**Kullanım (backend):**

```ts
import { getCountryAdapter } from "@/common/adapters";

const adapter = getCountryAdapter(tenant.country); // "TR" | "GB"
const formatted = adapter.formatCurrency(1234.56, "TRY");
// TR: "1.234,56 ₺"
```

**Kullanım (frontend):** Frontend formatlama için
`Intl` API'sini doğrudan kullanır; **ülkeye özel format**
gerektiğinde API'den formatlanmış string alır (server-side
rendering sırasında).

## 3. Ana Interface

`CountryAdapter` interface'i (`country-adapter.ts`):

```ts
export type CountryCode = "TR" | "GB";

export interface CountryAdapter {
  /** Ülke kodu */
  readonly code: CountryCode;

  /** Para birimi kodu (ISO 4217). */
  readonly currency: string;

  /** Yerel ayar (Intl locale). */
  readonly locale: string;

  /** Saat dilimi. */
  readonly timezone: string;

  // -- Formatlama --

  /** Tarihi ülke formatına göre formatlar. */
  formatDate(date: Date, options?: DateFormatOptions): string;

  /** Saati ülke formatına göre formatlar. */
  formatTime(date: Date, options?: TimeFormatOptions): string;

  /** Tarih+saat. */
  formatDateTime(date: Date, options?: DateTimeFormatOptions): string;

  /** Para birimini ülke formatına göre formatlar. */
  formatCurrency(
    amount: number | Decimal,
    options?: CurrencyFormatOptions,
  ): string;

  /** Sayıyı ülke formatına göre formatlar. */
  formatNumber(value: number, options?: NumberFormatOptions): string;

  /** Yüzde. */
  formatPercent(value: number, options?: PercentFormatOptions): string;

  // -- Alan formatları --

  /** Telefon numarasını ülke formatına göre formatlar. */
  formatPhone(phone: string, options?: PhoneFormatOptions): string;

  /** Telefon numarası doğrulaması (ülke kurallarına göre). */
  validatePhone(phone: string): ValidationResult;

  /** Posta kodunu formatlar/doğrular. */
  formatPostalCode(code: string): string;
  validatePostalCode(code: string): ValidationResult;

  /** Vergi numarası formatı (VKN/TCKN/TR; UTR/GB). */
  formatTaxId(taxId: string): string;
  validateTaxId(taxId: string, type: "company" | "personal"): ValidationResult;

  /** IBAN formatı (TR için TR26..., GB için GB29...). */
  formatIBAN(iban: string): string;
  validateIBAN(iban: string): ValidationResult;

  // -- Vergi/KDV --

  /** KDV oranları listesi. */
  getVatRates(): VatRate[];

  /** Belirli bir tarihteki KDV oranı. */
  getVatRateFor(category: VatCategory, date: Date): number;

  /** KDV tutarını hesaplar (KDV hariç → KDV dahil). */
  calculateVat(netAmount: Decimal, rate: number): VatBreakdown;

  // -- Belge / Fiş --

  /** Fiş/fatura numarası formatı. */
  formatReceiptNumber(sequence: number, prefix?: string): string;

  /** Fatura seri prefix'i (TR: "FTR", GB: "GB-INV"). */
  getInvoiceSeriesPrefix(): string;

  // -- Reçete formatı (veteriner) --

  /** Reçete numarası formatı. */
  formatPrescriptionNumber(sequence: number, year: number): string;

  /** Reçete geçerlilik süresi (varsayılan, gün). */
  getPrescriptionValidityDays(): number;

  // -- Adres --

  /** Adresi ülke formatına göre formatlar. */
  formatAddress(address: Address): string;

  // -- Bildirim kuralları --

  /** SMS/e-posta gönderim kuralları (KVKK/GDPR, opt-in). */
  getNotificationRules(): NotificationRules;
}
```

**Yardımcı tipler:**

```ts
export type DateFormatOptions = {
  /** "short" (1 Tem 2026), "medium" (1 Temmuz 2026), "long" (1 Temmuz 2026 Salı), "full" (Salı, 1 Temmuz 2026) */
  style?: "short" | "medium" | "long" | "full";
  /** Mevcut yıldan farklı yıl için ayraç (ör. "31.07.2026"). */
  includeYear?: boolean;
};

export type ValidationResult = {
  valid: boolean;
  error?: string; // Hata kodu (i18n anahtarı)
  normalized?: string; // Doğrulanmış/normalleştirilmiş değer
};

export type VatCategory =
  | "medicine" // İlaç
  | "vaccine" // Aşı
  | "pet_food" // Petshop gıda
  | "pet_accessory" // Aksesuar
  | "service" // Klinik hizmeti (muayene, ameliyat)
  | "other";

export type VatRate = {
  category: VatCategory;
  rate: number; // 0.20 = %20
  effectiveFrom: Date;
  effectiveTo?: Date;
};

export type VatBreakdown = {
  net: Decimal;
  vat: Decimal;
  gross: Decimal;
  rate: number;
};

export type Address = {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
};

export type NotificationRules = {
  /** KVKK/GDPR uyumu için önceden opt-in gerekli mi? */
  requiresOptIn: boolean;
  /** Varsayılan opt-in durumu. */
  defaultOptIn: boolean;
  /** SMS için saat kısıtı (gece gönderim yasağı). */
  smsQuietHours: { start: string; end: string };
  /** E-posta için günlük maksimum gönderim. */
  emailDailyLimit?: number;
  /** Pazarlama iletişimi için ek onay. */
  marketingConsentRequired: boolean;
};
```

## 4. TR Adapter — Türkiye (Pilot)

`tr-country.adapter.ts`. Faz 0'da **tam implementasyon**.

### 4.1. Para ve Sayı

| Alan | Format | Örnek |
| --- | --- | --- |
| Para | `₺1.234,56` (binlik `.`, ondalık `,`, sıralı `₺`) | `₺1.234,56` |
| Para (negatif) | `-₺1.234,56` (parantez kullanılmaz) | `-₺1.234,56` |
| Sayı | `1.234,56` | `1.234,56` |
| Yüzde | `%12,5` | `%12,5` |

**Uygulama:**

```ts
formatCurrency(amount: number | Decimal, options?: { showSymbol?: boolean }): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
// formatCurrency(1234.56) → "₺1.234,56"
```

### 4.2. Tarih ve Saat

| Alan | Format | Örnek |
| --- | --- | --- |
| Tarih (kısa) | `dd.MM.yyyy` | `31.07.2026` |
| Tarih (orta) | `d MMMM yyyy` | `31 Temmuz 2026` |
| Tarih (uzun) | `d MMMM yyyy, EEEE` | `31 Temmuz 2026 Cuma` |
| Saat | `HH:mm` (24-saat) | `14:30` |
| Tarih+Saat | `dd.MM.yyyy HH:mm` | `31.07.2026 14:30` |

**Saat dilimi:** `Europe/Istanbul` (UTC+3, yaz saati yok).

### 4.3. Telefon

| Alan | Format | Örnek |
| --- | --- | --- |
| Cep telefonu | `+90 5XX XXX XX XX` | `+90 532 123 45 67` |
| Sabit hat | `+90 (XXX) XXX XX XX` | `+90 (212) 555 12 34` |
| E.164 depolama | `+905321234567` (boşluksuz) | DB'de bu formatta saklanır |

**Doğrulama:** Türkiye telefon numarası `+90` ile başlar,
toplam 12 hane (90 + 10 hane). Operatör kodu 5XX ile başlar
(TR Mobil: 5XX).

```ts
validatePhone(phone: string): ValidationResult {
  const cleaned = phone.replace(/\s/g, "");
  // E.164: +90 + 10 hane
  if (/^\+90[5]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }
  return {
    valid: false,
    error: "validation.phone.invalid_tr",
  };
}
```

### 4.4. Vergi Numaraları

| Tür | Ad | Format | Doğrulama |
| --- | --- | --- | --- |
| VKN | Vergi Kimlik No (şirket) | 10 hane | Algoritma: son hane, ilk 9 hanenin mod 10'una göre hesaplanır |
| TCKN | T.C. Kimlik No (kişi) | 11 hane | Algoritma: son 2 hane, ilk 9 hanenin mod 10 ve mod 11'ine göre |
| İBAN | TR IBAN | `TR` + 2 hane kontrol + 22 hane (toplam 26) | ISO 13616 mod 97-10 |
| e-Fatura mükellefi | GİB kayıt no | 16 hane | GİB doğrulama (Faz 7+) |

**VKN doğrulama (Türk algoritması):**

```ts
function validateVKN(vkn: string): boolean {
  if (!/^\d{10}$/.test(vkn)) return false;
  const digits = vkn.split("").map(Number);
  const sum = digits.slice(0, 9).reduce((acc, d, i) => {
    const mod = (d * Math.pow(2, 9 - i)) % 10;
    return acc + mod;
  }, 0);
  const checkDigit = (sum % 10 === 0 ? 0 : 10 - (sum % 10));
  return checkDigit === digits[9];
}
```

### 4.5. Adres

| Alan | Örnek |
| --- | --- |
| Adres satırı 1 | `Atatürk Mah. Cumhuriyet Cad.` |
| Adres satırı 2 | `No: 25 Daire: 7` |
| İlçe/İl | `Kadıköy / İstanbul` |
| Posta kodu | `34710` (5 hane) |
| Ülke | `Türkiye` |

**Format:**

```ts
formatAddress(address: Address): string {
  const lines = [
    address.line1,
    address.line2,
    `${address.state ?? ""} ${address.postalCode} ${address.city}`,
    "Türkiye",
  ].filter(Boolean);
  return lines.join("\n");
}
// Çıktı:
// Atatürk Mah. Cumhuriyet Cad.
// No: 25 Daire: 7
// 34710 Kadıköy
// Türkiye
```

### 4.6. KDV Oranları (TR, 2026 itibarıyla)

| Kategori | Oran |
| --- | --- |
| İlaç (beşeri) | %8 |
| Veteriner ilaç | %8 veya %10 (ürüne göre) |
| Aşı | %8 |
| Pet food (mama) | %10 |
| Pet accessory | %20 |
| Klinik hizmeti (muayene, ameliyat) | %20 |
| Tıbbi malzeme | %20 |
| Diğer | %20 |

`getVatRateFor(category, date)` metodu ürün tipine göre güncel
KDV oranını döner. Resmi Gazete değişiklikleri için
`effectiveFrom`/`effectiveTo` alanları kullanılır.

### 4.7. Fiş/Fatura Numarası

- **e-Fatura:** GİB tarafından atanan UUID formatında (Faz 7+).
- **Manuel fiş:** `<YIL><AY>-<SIRA>` formatında. Örnek:
  `202607-0001` (2026 Temmuz, 1. fiş).
- **e-Arşiv:** Yine GİB tarafından atanan UUID.

`formatReceiptNumber(sequence, prefix?)`:

```ts
const year = new Date().getFullYear();
const month = String(new Date().getMonth() + 1).padStart(2, "0");
const seq = String(sequence).padStart(4, "0");
return `${prefix ?? "FIS"}${year}${month}-${seq}`;
// "FIS202607-0001"
```

### 4.8. Reçete

- **Reçete no:** `R<YIL>-<SIRA>` (5 hane sıra). Örnek: `R2026-00001`.
- **Geçerlilik:** 30 gün (yazılı tarihten itibaren).
- **İmza:** Islak imza veya e-imza (Faz 8+).
- **İlaç listesi:** Sıralı (önce acil, sonra kronik).

### 4.9. Bildirim Kuralları (KVKK)

```ts
getNotificationRules(): NotificationRules {
  return {
    requiresOptIn: true, // KVKK Madde 5/6 — açık rıza
    defaultOptIn: false,
    smsQuietHours: { start: "22:00", end: "08:00" }, // Gece SMS yasak
    emailDailyLimit: 5, // Hasta sahibine günde max 5 e-posta
    marketingConsentRequired: true, // Pazarlama için ayrı onay
  };
}
```

## 5. GB Adapter — İngiltere (İskelet)

`gb-country.adapter.ts`. **Yalnızca iskelet**, gerçek mevzuat
implementasyonu Faz 14'te (en-GB pazarı).

### 5.1. Para ve Sayı (Placeholder)

| Alan | Format | Örnek |
| --- | --- | --- |
| Para | `£1,234.56` (binlik `,`, ondalık `.`) | `£1,234.56` |
| Sayı | `1,234.56` | `1,234.56` |
| Yüzde | `12.5%` | `12.5%` |

**Uygulama (placeholder):**

```ts
formatCurrency(amount: number | Decimal): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
// formatCurrency(1234.56) → "£1,234.56"
```

### 5.2. Tarih ve Saat

| Alan | Format | Örnek |
| --- | --- | --- |
| Tarih | `dd/MM/yyyy` | `31/07/2026` |
| Saat | `HH:mm` (24-saat) | `14:30` |
| Saat (12-saat) | `h:mm a` | `2:30 pm` |
| Tarih+Saat | `dd/MM/yyyy HH:mm` | `31/07/2026 14:30` |

**Saat dilimi:** `Europe/London` (UTC+0 / UTC+1 yaz saati).

### 5.3. Telefon (Placeholder)

| Alan | Format | Örnek |
| --- | --- | --- |
| Cep telefonu | `+44 7XXX XXXXXX` | `+44 7700 900123` |
| Sabit hat | `+44 20 XXXX XXXX` | `+44 20 7946 0958` |

**Not:** Faz 14'te Ofcom telefon numarası planına göre
detaylandırılacak.

### 5.4. Vergi (Placeholder)

| Tür | Ad | Format |
| --- | --- | --- |
| UTR | Unique Taxpayer Reference | 10 hane |
| VRN | VAT Registration Number | `GB` + 9 hane |
| NHS | National Health Service | 10 hane |
| IBAN | GB IBAN | `GB` + 2 kontrol + 18 hane (toplam 22) |

### 5.5. KDV (Placeholder)

GB'de standart oran %20, indirimli %5, sıfır %0.
İlaç ve aşı için genellikle %0 (veteriner muafiyetleri Faz 14'te).

### 5.6. Belge (Placeholder)

- **Fatura:** `GB-INV-<YEAR>-<SEQ>` formatı (HMRC uyumlu, Faz 14'te).
- **Reçete:** RCVS kayıt no (Faz 14'te).
- **Bildirim:** GDPR + PECR uyumlu. Pazarlama için soft opt-in.

### 5.7. Açık TODO'lar (Faz 14+)

GB adapter'da aşağıdaki alanlar Faz 14'te doldurulacak:

- RCVS (Royal College of Veterinary Surgeons) reçete kuralları.
- VMD (Veterinary Medicines Directorate) aşı raporlama.
- HMRC Making Tax Digital (MTD) entegrasyonu.
- BVA (British Veterinary Association) klinik kayıt standartları.
- Petslog mikroçip veritabanı entegrasyonu.
- NHS hasta yönlendirme kuralları.
- Brexit sonrası hayvan hareketi kuralları (TR/GB arası).
- İngilizce reçete formatı (BCD/VMG no).
- PDSA ve diğer yardım kuruluşlarıyla entegrasyon.

## 6. Adapter Registry

`adapter.registry.ts`. Tenant.country'ye göre uygun adapter
döner.

```ts
const adapters = new Map<CountryCode, CountryAdapter>([
  ["TR", new TrCountryAdapter()],
  ["GB", new GbCountryAdapter()],
]);

export function getCountryAdapter(country: CountryCode): CountryAdapter {
  const adapter = adapters.get(country);
  if (!adapter) {
    throw new DomainError(
      "TR_COUNTRY_0001",
      `Desteklenmeyen ülke: ${country}`,
    );
  }
  return adapter;
}

export function registerCountryAdapter(
  country: CountryCode,
  adapter: CountryAdapter,
): void {
  adapters.set(country, adapter);
}
```

**Tenant bazlı override (Faz 14+):**

```ts
export function getCountryAdapterForTenant(
  tenant: { country: CountryCode },
): CountryAdapter {
  // Tenant özel override varsa kullan, yoksa global adapter
  return tenantAdapters.get(tenant.id) ?? getCountryAdapter(tenant.country);
}
```

## 7. NestJS Module

`adapter.module.ts`. DI container'a adapter'ları bağlar.

```ts
@Module({
  providers: [
    TrCountryAdapter,
    GbCountryAdapter,
    {
      provide: "COUNTRY_ADAPTER_REGISTRY",
      useFactory: (tr: TrCountryAdapter, gb: GbCountryAdapter) => {
        const map = new Map<CountryCode, CountryAdapter>();
        map.set("TR", tr);
        map.set("GB", gb);
        return map;
      },
      inject: [TrCountryAdapter, GbCountryAdapter],
    },
    AdapterRegistry,
  ],
  exports: [AdapterRegistry, "COUNTRY_ADAPTER_REGISTRY"],
})
export class AdapterModule {}
```

`AdapterRegistry` servisi, controller'lara enjekte edilir:

```ts
@Injectable()
export class PatientsController {
  constructor(private readonly adapters: AdapterRegistry) {}

  @Get(":id")
  async getPatient(@Param("id") id: string) {
    const tenant = await this.tenants.getCurrent();
    const adapter = this.adapters.getFor(tenant);
    // ...
  }
}
```

## 8. Test

`adapter.spec.ts`. Her adapter için unit test.

- `formatDate`, `formatCurrency`, `formatNumber` (çeşitli girişler).
- `validatePhone`, `validateTaxId` (geçerli/geçersiz örnekler).
- `getVatRateFor` (farklı kategoriler ve tarihler).
- `formatAddress` (eksik alanlar dahil).
- `getNotificationRules` (snapshot).

**Snapshot test:** Adapter çıktılarının zaman içinde
değişmemesi için snapshot testleri kullanılır.

## 9. Frontend Kullanım

Frontend'de formatlama iki yöntemle yapılır:

1. **API'den formatlanmış al:** API response'unda
   `displayValue` alanı varsa frontend bunu kullanır. Örnek:
   ```json
   { "amount": 1234.56, "displayValue": "₺1.234,56" }
   ```
2. **Frontend Intl API:** API yalnızca raw değer dönerse
   frontend `Intl.NumberFormat` kullanır. **ÖNEMLİ:**
   Frontend'de `Intl` kullanırken tenant'ın `country`'si
   kullanılmalı, kullanıcının `locale`'i değil.

**Pratik:** Frontend `useCountry()` hook'u ile tenant'ın
ülkesini alır ve `formatCurrency(value)` için tenant'ın
country'sine göre `Intl` çağırır.

## 10. Tenant Oluşturma

Yeni tenant oluşturulurken (sadece SUPERADMIN) `country`
alanı seçilir. Bu alan **sonradan değiştirilemez** (vergi,
para, telefon gibi kurallar kayıtlara bağlıdır).

- Yeni tenant oluşturma akışı Faz 1'de detaylandırılacak
  (GOAL-010).
- Country değişikliği talep edilirse tenant kapatılıp
  yeni tenant açılır (geçiş döneminde klinik eski
  tenant üzerinden çalışmaya devam eder).

## 11. Gözlem ve Hata Yönetimi

- **TR_COUNTRY_0001** — Desteklenmeyen ülke kodu
- **TR_COUNTRY_0002** — Adapter yüklenemedi (init hatası)
- **TR_VALIDATION_PHONE_0001** — Geçersiz telefon (ülke özelinde)
- **TR_VALIDATION_TAX_0001** — Geçersiz vergi numarası
- **TR_VALIDATION_IBAN_0001** — Geçersiz IBAN
- **TR_VALIDATION_POSTAL_0001** — Geçersiz posta kodu

Tüm hata kodları `docs/errors/ERROR_CATALOG.md`'ye Faz 4
ile birlikte eklenecek.

## 12. Genişleme Planı

| Faz | Yeni ülke | Planlanan |
| --- | --- | --- |
| 0 | TR (pilot) | Tam implementasyon |
| 14 | GB (en-GB pazarı) | Tam mevzuat implementasyonu (RCVS, VMD, HMRC) |
| 15+ | DE, FR, IT | Adapter iskeleti, ülke mevzuatına göre detaylandırma |
| 16+ | US, CA, AU | Adapter iskeleti, AAB/KVH kuralları |

Yeni ülke eklemek için:

1. `CountryCode` union'ına ekle.
2. `<ülke>-country.adapter.ts` dosyası oluştur.
3. `adapter.registry.ts`'e kayıt et.
4. `i18n-check` parity doğrulaması için yeni locale ekle.
5. UI tarafında `Country` enum'ını güncelle.
6. Test ekle, snapshot'ları güncelle.

## İlgili dokümanlar

- [`I18N_CONTRACT.md`](./I18N_CONTRACT.md) — çoklu dil sözleşmesi.
- `packages/contracts/src/locale.ts` — desteklenen locale'ler.
- `apps/api/src/common/adapters/` — implementasyon.
- `docs/domain/DOMAIN_GLOSSARY.md` — varlık sözlüğü (adres
  alanları için).
- `docs/permissions/PERMISSION_CATALOG.yaml` — permission
  kataloğu.
- `docs/errors/ERROR_CATALOG.md` — hata kataloğu (Faz 4'te).
- `docs/ai/AI_KNOWLEDGE_BASE.md` — RAG chunk yapısı.
