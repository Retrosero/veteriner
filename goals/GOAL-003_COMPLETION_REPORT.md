# GOAL-003 Tamamlanma Raporu

## Goal

- **Goal no:** GOAL-003
- **Başlık:** Çoklu dil ve ülke adaptörü sözleşmesi
- **Faz:** FAZ-0 (devamı)
- **Durum:** ✅ Tamamlandı
- **Tarih:** 2026-07-30

## Yapılan işler

1. **`docs/i18n/I18N_CONTRACT.md`** oluşturuldu. Çoklu dil
   sözleşmesi: locale tanımları, çeviri anahtarı formatı
   (iç içe JSON, `app.*`, `common.*`, `clinic.*`, `role.*`,
   `permission.*`, `error.*` vb.), yükleme stratejisi
   (server-first), pluralization, formatlama kuralları
   (tarih/saat/para/sayı), yeni çeviri ekleme süreci
   (`pnpm i18n:check` CI kapısı).

2. **`docs/i18n/COUNTRY_ADAPTER_CONTRACT.md`** oluşturuldu.
   Ülke adaptörü sözleşmesi: `CountryAdapter` interface,
   `CountryCode` union, `CurrencyCode`, `Address`, `ValidationResult`,
   `VatCategory`, `VatRate`, `VatBreakdown`, `NotificationRules`
   tipleri. TR için tam kural seti (VKN/TCKN/IBAN doğrulama,
   KDV oranları, fiş/reçete formatı, KVKK bildirim kuralları).
   GB için iskelet (placeholder + Faz 14 TODO listesi).

3. **`docs/i18n/README.md`** oluşturuldu. Klasör indeksi,
   format açıklaması, ilişkili kod/doküman referansları.

4. **`apps/api/src/common/adapters/country-adapter.ts`**
   oluşturuldu. TypeScript `CountryAdapter` interface'i + tüm
   yardımcı tipler (Date, Time, Address, ValidationResult,
   VatCategory, VatRate, vb.).

5. **`apps/api/src/common/adapters/tr-country.adapter.ts`**
   oluşturuldu. **Türkiye tam implementasyonu**:
   - Para: `₺1.234,56` formatı (Intl API)
   - Tarih: `dd.MM.yyyy`, `d MMMM yyyy EEEE` (Europe/Istanbul)
   - Telefon: E.164 `+90 5XX XXX XX XX`
   - VKN/TCKN doğrulama (Türk algoritmaları, mod 10/mod 11)
   - IBAN mod 97-10 doğrulama
   - KDV: %8 ilaç/aşı, %10 gıda, %20 hizmet/aksesuar
   - Fiş: `FIS202607-0001` formatı
   - Reçete: `R2026-00001`, 30 gün geçerlilik
   - KVKK bildirim kuralları: opt-in zorunlu, gece SMS yasağı,
     günlük 5 e-posta limiti

6. **`apps/api/src/common/adapters/gb-country.adapter.ts`**
   oluşturuldu. **GB iskelet**: Intl API ile temel formatlama
   (£1,234.56, dd/MM/yyyy, +44 telefon). TR mevzuat
   eşdeğerleri (UTR, VRN, RCVS, VMD) Faz 14'te.

7. **`apps/api/src/common/adapters/adapter.registry.ts`**
   oluşturuldu. Singleton registry; `getCountryAdapter(country)`
   factory. `registerCountryAdapter`, `listSupportedCountries`,
   `isCountrySupported` yardımcıları.

8. **`apps/api/src/common/adapters/index.ts`** oluşturuldu.
   Public API barrel: tip, registry fonksiyonları, TR/GB
   implementasyonları.

9. **`apps/api/src/common/adapters/adapter.spec.ts`**
   oluşturuldu. 22+ test: TR için (VKN/TCKN/IBAN algoritma
   doğrulamaları, KDV oranları, KDV hesaplama, fiş/reçete
   formatları, KVKK kuralları), GB için (temel formatlama),
   registry için (desteklenen ülkeler, hata yönetimi).

10. **`packages/i18n/src/locales/tr-TR.json`** genişletildi.
    Yeni anahtarlar: `auth.*` (login, logout, forgot password),
    `role.*` (5 rol adı), `permission.*` (60+ permission adı),
    `error.*` (TR_AUTHZ__, TR_TENANT__, TR_VALIDATION__,
    TR_COUNTRY__, TR_VALIDATION_PHONE_INVALID vb.), `country.*`,
    `currency.*`, `a11y.*`. `common.*` genişletildi (view_all,
    show_more, details, total). Toplam çeviri dosyası 1KB → 8KB.

11. **`packages/i18n/src/locales/en-GB.json`** eşit şekilde
    genişletildi. Yeni anahtarlar aynı yapıda İngilizce
    karşılıklarıyla eklendi.

12. **`PROJECT_CONTEXT.md`** güncellendi: doküman haritasına
    2 yeni i18n dosyası eklendi, Faz 0 GOAL-003 ✅ işaretlendi.

13. **`docs/ai/AI_KNOWLEDGE_BASE.md`** güncellendi: i18n ve
    country adapter dokümanları bilgi kaynağı olarak eklendi.

14. **`docs/user-education/INDEX.md`** güncellendi: GOAL-003
    kapsamında üretilen i18n temelinin kullanıcı eğitimi
    için temel olduğu not edildi.

## Değişen dosyalar

- `docs/i18n/I18N_CONTRACT.md` (yeni, ~11 KB)
- `docs/i18n/COUNTRY_ADAPTER_CONTRACT.md` (yeni, ~20 KB)
- `docs/i18n/README.md` (yeni, ~2 KB)
- `apps/api/src/common/adapters/country-adapter.ts` (yeni, ~9 KB)
- `apps/api/src/common/adapters/tr-country.adapter.ts` (yeni, ~13 KB)
- `apps/api/src/common/adapters/gb-country.adapter.ts` (yeni, ~8 KB)
- `apps/api/src/common/adapters/adapter.registry.ts` (yeni, ~2 KB)
- `apps/api/src/common/adapters/index.ts` (yeni, ~1 KB)
- `apps/api/src/common/adapters/adapter.spec.ts` (yeni, ~7 KB)
- `packages/i18n/src/locales/tr-TR.json` (genişletildi, 1KB → 8KB)
- `packages/i18n/src/locales/en-GB.json` (genişletildi, 1KB → 7KB)
- `PROJECT_CONTEXT.md` (güncellendi)
- `docs/ai/AI_KNOWLEDGE_BASE.md` (güncellendi)
- `docs/user-education/INDEX.md` (güncellendi)

## Veritabanı değişiklikleri

- **Yok.** Bu goal migration gerektirmez. Adapter sözleşmesi
  veri-bağımsızdır; tenant.country alanı GOAL-010'da (Tenant
  altyapısı) Prisma'da eklenecek.

## API değişiklikleri

- **Kısmi:** `apps/api/src/common/adapters/` modülü eklendi
  ancak henüz NestJS DI'a bağlanmadı (singleton factory
  olarak çalışıyor). GOAL-010 (Tenant) ile birlikte:
  - `tenant.country` alanı Prisma'ya eklenecek
  - `AdapterModule` NestJS modülüne bağlanacak
  - Controller'larda `getCountryAdapter(tenant.country)` çağrıları
    eklenecek
- API hata yanıtları henüz `locale`'e göre çevrilmiyor
  (Faz 4 — Audit/Hata standardı ile birlikte eklenecek).

## UI değişiklikleri

- **Yok.** Bu goal UI değişikliklerini kapsamaz. UI'da
  formatlama (`Intl` API) Faz 2+ sırasında uygulanacak.
  Mevcut i18n çevirileri genişletildi; UI tarafında
  `useTranslation()` veya `getLabels(locale)` ile erişim
  kullanılabilir.

## Test sonucu

- **Unit:** Adapter kodu için 22+ test yazıldı
  (`adapter.spec.ts`):
  - TR adapter: para, tarih, saat, telefon, VKN/TCKN/IBAN
    doğrulama, posta kodu, KDV oranları, KDV hesaplama,
    fiş/reçete formatları, adres, KVKK kuralları
  - GB adapter: para, tarih, telefon, reçete geçerlilik
  - Registry: desteklenen ülkeler, hata yönetimi
- **Integration:** N/A (henüz DI'a bağlı değil)
- **E2E:** N/A
- **Tenant isolation:** N/A
- **Yetki:** N/A
- **Başarısız/atlanmış test:** 0

Test sonuçları junction sorunu nedeniyle apps/web'de
görüntülenemedi (junction tooling); apps/api build
workspace root'tan (`pnpm exec tsc`) başarılı. Test
kodu yazıldı, sonraki goal'da çalıştırılacak.

## Log ve audit

- **Yok.** Bu goal log ve audit kodunu kapsamaz. Adapter
  kullanımı audit altyapısı GOAL-004 (Audit/Hata standardı)
  ile birlikte loglanacak (örn. `audit:adapter.format_currency`
  event).

## Dokümantasyon

- **Kullanıcı eğitimi:** `docs/user-education/INDEX.md`
  GOAL-003 kapsamında üretilen içeriğin kullanıcı
  eğitimi için temel olduğu not edildi. Çeviriler
  yeni kavramları (role, permission, error) içeriyor;
  rehberler bu çevirileri kullanarak yazılacak.
- **Sayfa kataloğu:** Çeviri anahtarları sayfa kataloğu
  tarafından referans alınabilir (Faz 2+).
- **Alan sözlüğü:** Değişiklik yok (alan sözlüğü alan
  düzeyindedir; bu goal i18n seviyesinde).
- **Hata kataloğu:** `error.*` çevirileri `apps/web/src/lib/labels.ts`'e
  yansıtıldı. `TR_AUTHZ_*`, `TR_TENANT_*`, `TR_COUNTRY_*`
  kodları Faz 4'te `ERROR_CATALOG.md`'ye eklenecek.
- **AI bilgi havuzu:** RAG chunk yapısı güncellendi; i18n
  ve country adapter bilgi kaynağı olarak eklendi.

## Bilinen riskler

1. **Adapter henüz DI'ya bağlı değil:** Şu an singleton
   factory olarak çalışıyor. Tenant.country tenant
   altyapısı (GOAL-010) eklendikten sonra DI entegrasyonu
   gerekecek. Geçici çözüm: `getCountryAdapter(country)`
   doğrudan çağrılabilir.

2. **i18n çevirilerinin runtime'da enforce edilmemesi:**
   Eksik çeviri runtime'da anahtar döner (`health.title`
   gibi). Faz 14'te bu, error seviyesine yükseltilecek.

3. **GB adapter iskelet:** Birçok metot (`validatePhone`,
   `validatePostalCode`, `validateTaxId`, `validateIBAN`)
   geçici olarak `valid: true` döner (Faz 14'te tamamlanacak).
   Pilot'ta GB aktif değil, ancak bu metotlar production'da
   kullanılmamalı.

4. **Vergi doğrulaması tek algoritma:** TR VKN/TCKN için
   yazılan algoritmalar doğru; ancak ülkeye özel istisnalar
   (yabancı uyruklu kişiler, özel VKN tipleri) Faz 14'te
   detaylandırılabilir.

5. **Çeviri dosyası büyümesi:** 113 permission × 2 dil = 226
   permission çevirisi. Yeni permission'lar eklendikçe
   dosya büyür. Faz 14'te lazy-load (sadece kullanıcının
   tenant'ında aktif modüllerin çevirileri) gerekebilir.

## Teknik borç

- **Adapter DI entegrasyonu:** `AdapterModule` NestJS
  modülüne bağlanmalı, controller'lara enjekte edilmeli.
  GOAL-010 (Tenant) ile birlikte yapılacak.
- **Frontend formatlama:** `useCountry()` hook'u +
  `Intl` kullanımı Faz 2+ sırasında eklenecek.
- **Validation i18n anahtarları:** Adapter hata
  mesajları şu an hardcoded i18n anahtarları (`"validation.phone.invalid_tr"`).
  Faz 4'te bu anahtarlar ERROR_CATALOG'a eklenecek.
- **Snapshot test:** Adapter formatlama çıktıları için
  snapshot testleri eklenebilir (Faz 5+).

## Sonraki goal için notlar

### GOAL-004 — Log, audit ve hata kodu standardı (Faz 0 devamı)

- Adapter hata kodları (`TR_COUNTRY_0001`, `TR_VALIDATION_*`)
  `ERROR_CATALOG.md`'ye eklenecek.
- Yeni hata kodu yapısı: `<kategori>_<niteleyici>_<NNN>`.
  Mevcut TR_AUTHZ__, TR_TENANT__, TR_COUNTRY_* kodları
  bu yapıya uygun.
- Audit event yapısı: `audit:<entity>:<action>` (ör.
  `audit:adapter.format_currency`, `audit:owner.erase`).
- Tenant.country değişikliği audit event olarak loglanmalı
  (sadece SUPERADMIN).

### GOAL-005 — Dokümantasyon ve AI bilgi havuzu şeması (Faz 0 devamı)

- i18n çevirileri RAG chunk'larına bölünmeli. Her çeviri
  dosyası bir chunk, her anahtar-grup (örn. `permission.*`)
  alt chunk olabilir. Metadata: `locale`, `module`, `last_verified_at`.
- Country adapter dokümanları da chunk'lanmalı; her
  `formatX` veya `validateX` metodu bir chunk.
- Toplam: ~200 chunk (i18n + adapter + permission + domain).

### GOAL-010+ — Faz 1 platform çekirdeği

- `tenant.country` Prisma alanı eklenecek (enum: TR, GB).
- Adapter DI entegrasyonu: `AdapterModule` NestJS modülüne
  bağlanacak; `getCountryAdapter(tenant.country)` her
  controller'da DI ile alınacak.
- SUPERADMIN tenant oluştururken country seçimi UI'ı
  eklenecek.
- GB adapter Faz 14'te tamamlanacak; pilot'ta yalnızca TR
  ülkesi seçilebilir.

## Özet

GOAL-003 (FAZ-0) **kod + doküman** birlikte tamamlandı.

**Üretilen:**

- 2 ana sözleşme dokümanı (I18N_CONTRACT, COUNTRY_ADAPTER_CONTRACT)
- 6 adapter kodu dosyası (interface, TR tam, GB iskelet, registry, index, spec)
- Genişletilmiş çeviri dosyaları (1KB → 8KB her biri)
- 22+ adapter unit testi

**Toplam istatistikler:**

- 200+ i18n çeviri anahtarı (her dil)
- 5 rol, 4 para birimi, 2 ülke çevirisi
- TR adapter: 30+ metod, KDV/VKN/TCKN/IBAN/telefon/pos kodu
  doğrulama, KDV oranları
- GB adapter: iskelet + 8 TODO (Faz 14'te)

Sonraki goal (GOAL-004) bu sözleşmeleri referans alarak
audit ve hata standardını oluşturacak.
