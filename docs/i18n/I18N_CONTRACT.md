# @file Çoklu Dil (i18n) Sözleşmesi.

# @module docs/i18n/I18N_CONTRACT

#

# @description VetNiva'nın çoklu dil mimarisinin sözleşmesi.

# Locale'ler, çeviri anahtarı formatı, yükleme stratejisi,

# pluralization, formatlama (tarih/saat/para/sayı) ve yeni

# çeviri ekleme süreci bu dokümanda tanımlanır.

#

# @author GOAL-003 (FAZ-0 devamı) çoklu dil sözleşmesi

# @since 2026-07-30

# =============================================================================

# Çoklu Dil (i18n) Sözleşmesi

VetNiva, çekirdek altyapısı düzeyinde çoklu dil destekler.
Yeni dil eklemek **kod değişikliği gerektirmez**; yalnızca
çeviri dosyalarının eklenmesi yeterlidir.

## 1. Locale Tanımları

Desteklenen locale'ler `SUPPORTED_LOCALES` ile merkezi olarak
tanımlanır (`packages/contracts/src/locale.ts`). Her locale
için `<locale>` formatı:
`<dil>-<ülke>` (ör. `tr-TR`, `en-GB`).

**Pilot kapsamda:**

- `tr-TR` (Türkçe, Türkiye) — **varsayılan**
- `en-GB` (İngilizce, Birleşik Krallık) — **iskelet**

**Yeni locale eklemek için:**

1. `packages/contracts/src/locale.ts`'e `SUPPORTED_LOCALES`'e
   ekle.
2. `packages/i18n/src/locales/<locale>.json` çeviri dosyasını
   oluştur.
3. `apps/web/src/middleware.ts` (varsa) locale yönlendirme
   kurallarını güncelle.
4. `apps/web/src/lib/labels.ts`'e yeni locale için fallback
   davranışını doğrula.

**Ülke (country) locale'den ayrıdır:** Locale UI dilini,
ülke (country) ise iş kurallarını (para birimi, vergi, telefon
formatı, vb.) belirler. Bir kullanıcı `en-GB` (İngilizce
arayüz) + `TR` (Türkiye iş kuralları) kombinasyonuna sahip
olabilir. Bu, özellikle Türkiye'deki yabancı veterinerler
için önemlidir.

## 2. Çeviri Anahtarı Formatı

Çeviri anahtarları **iç içe JSON objeleri** ile organize edilir.
Format: `<namespace>.<entity>.<field>` (nokta ayraçlı).

**Örnekler:**

- `app.name` → "VetNiva"
- `app.tagline` → "Veteriner klinik yönetim sistemi"
- `common.save` → "Kaydet"
- `common.cancel` → "Vazgeç"
- `clinic.appointment.create.title` → "Yeni Randevu"
- `clinic.vaccination.create.success` → "Aşı kaydı oluşturuldu."
- `role.OWNER` → "İşletme Sahibi"
- `role.VETERINARIAN` → "Veteriner Hekim"
- `permission.clinic:appointment:create` → "Randevu Oluşturma"
- `error.TR_AUTHZ_0001` → "Bu işlem için yetkiniz bulunmuyor."

**Hiyerarşi:**

```
app.* — Uygulama genelinde (ad, slogan)
common.* — Genel aksiyonlar (save, cancel, edit, vb.)
auth.* — Kimlik doğrulama (login, logout, forgot password)
nav.* — Navigasyon menüsü öğeleri
clinic.* — Klinik modülü (randevu, muayene, aşı, reçete, ...)
petshop.* — Petshop modülü
portal.* — Portal özel
role.* — Rol isimleri (GOAL-002'den)
permission.* — Permission isimleri (GOAL-002'den)
error.* — Hata kodu mesajları
status.* — Genel durum mesajları
units.* — Birim (ms, %, ₺)
days.* — Gün kısaltmaları (Pzt, Sal, ...)
months.* — Ay kısaltmaları (Oca, Şub, ...)
```

**İsimlendirme kuralları:**

- Tüm anahtarlar `kebab-case` veya `snake_case` (tutarlılık için
  `snake_case` tercih edilir: `clinic.appointment.create.title`).
- Plural formlar i18next `key_one` / `key_other` deseniyle:
  `cart.item_count_one` / `cart.item_count_other`.
- Hiyerarşi en fazla 4 seviye (aşırı derinlik yasak).
- Aynı anahtar, iki dilde de aynı yapıda olmalı (asimetri
  yasak). `pnpm i18n:check` CI kapısı bunu doğrular.

## 3. Yükleme Stratejisi

VetNiva **server-first** mimari kullanır. Çeviriler:

- **Server component'ler (RSC):** Server tarafında, istek
  başına çözümlenir. `getT(locale)(key)` ile. Çeviriler
  HTML'e gömülü gider, istemci bundle'ında çeviri yoktur
  → küçük bundle.
- **Client component'ler:** `useTranslation()` hook'u yerine
  `useLocale()` + `getLabels(locale)` pattern'i kullanılır
  (bkz. `apps/web/src/lib/labels.ts`). Server'da çözümlenmiş
  etiketler prop olarak geçirilir. **İstisna:** `react-i18next`
  yalnızca kök layout'ta (hydration için) kullanılabilir.
- **API hata mesajları:** `error.<CODE>` anahtarı server tarafında
  çözümlenir, response body'sinde kullanıcının locale'ine göre
  döner. Frontend bu mesajı doğrudan gösterir.

**Performans hedefi:**

- Server'da ilk istek: < 50ms çeviri çözümleme süresi.
- Toplam çeviri dosyası boyutu: < 100KB (gzip sonrası).
- Lazy load: İlk locale dışındaki diller chunk'lı yüklenir
  (Faz 14+).

## 4. Tarih/Saat/Sayı/Para Formatlaması

**Önemli:** Bu kurallar **ülke (country) tarafından** yönetilir,
dil (locale) tarafından DEĞİL. Örnek: Aynı `en-GB` locale'i
Türkiye'de ve İngiltere'de farklı para birimi gösterebilir.

Formatlama için `Intl` API kullanılır. Ülke adaptörü bu API'yi
sarmalayan tipli fonksiyonlar sağlar (bkz. COUNTRY_ADAPTER_CONTRACT.md).

**Varsayılanlar:**

| Alan       | Türkiye (TR)                              | İngiltere (GB)                            |
| ---------- | ----------------------------------------- | ----------------------------------------- |
| Tarih      | `dd.MM.yyyy` (31.07.2026)                 | `dd/MM/yyyy` (31/07/2026)                 |
| Saat       | `HH:mm` (24-saat, 14:30)                  | `HH:mm` (24-saat, 14:30)                  |
| Tarih+Saat | `dd.MM.yyyy HH:mm`                        | `dd/MM/yyyy HH:mm`                        |
| Para       | `₺1.234,56` (1.234,56 TRY)                | `£1,234.56` (1,234.56 GBP)                |
| Sayı       | `1.234,56` (binlik nokta, ondalık virgül) | `1,234.56` (binlik virgül, ondalık nokta) |
| Yüzde      | `%12,5`                                   | `12.5%`                                   |
| Telefon    | `+90 5XX XXX XX XX` (E.164 + lokal)       | `+44 7XXX XXXXXX` (E.164)                 |
| Posta kodu | `34XXX` (5 hane)                          | `SW1A 1AA` (alfanumerik)                  |
| Vergi no   | `VKN/TCKN` (10/11 hane)                   | `UTR/VRN` (10 hane)                       |
| KDV oranı  | `%1, %10, %20`                            | `%0, %5, %20`                             |

**Uygulama:** Ülke adaptörü `formatDate()`, `formatCurrency()`,
`formatNumber()` vb. fonksiyonlar sağlar. `Intl.DateTimeFormat`,
`Intl.NumberFormat` doğrudan kullanılır, **ülke koduna göre
çağrılır** (ör. `new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })`).

## 5. Yeni Çeviri Ekleme Süreci

Yeni bir UI metni eklenirken:

1. **Anahtar oluştur:** `<namespace>.<entity>.<field>` formatında
   `tr-TR.json` ve `en-GB.json` dosyalarına **birlikte** ekle.
2. **CI doğrulama:** `pnpm i18n:check` çalıştır; her iki
   dilde de anahtar var mı, asimetri var mı kontrol edilir.
3. **Türkçe öncelikli:** Varsayılan dil Türkçe olduğu için
   tüm anahtarlar önce Türkçe tanımlanır, sonra İngilizce
   çevirisi eklenir.
4. **Yorum:** Türkçe çeviri bağlama uygun (kısa, doğal).
   Çevirmen sadece çeviri yapmaz, bağlamı da düşünür.
5. **PR:** Çeviri değişikliği ayrı bir PR olabilir veya
   feature PR'ına dahil edilebilir; `pnpm i18n:check` geçmeden
   merge yapılmaz.

## 6. Pluralization

İngilizce gibi dillerde plural formlar sınırlıdır (one/other).
Türkçe de tek form kullanır. Ancak gelecekte Arapça (6 form)
veya Rusça (3 form) desteklendiğinde i18next `key_one`,
`key_few`, `key_many`, `key_other` gibi suffixtler ile
yönetilir.

**Örnek (mevcut):**

```json
{
  "cart": {
    "item_count_one": "{{count}} ürün",
    "item_count_other": "{{count}} ürün"
  }
}
```

Türkçe'de one/other aynı metin olabilir. İngilizce'de
`"1 item"` vs `"{{count}} items"`.

**Not:** Bu proje Faz 0'da yalnızca Türkçe ve İngilizce
içerdiğinden pluralization altyapısı sınırlı kullanılır.
Yeni dil eklenirken (`ar`, `ru`, vb.) pluralization
dokümantasyonu güncellenecek.

## 7. Yapısal Kurallar

- **Türkçe karakter kullanımı:** Doğru Unicode kullanılır;
  `İ/i`, `Ş/ş`, `Ğ/ğ`, `Ü/ü`, `Ö/ö`, `Ç/ç` doğru yazılır.
- **Encoding:** Tüm çeviri dosyaları UTF-8 (BOM'suz) olarak
  kaydedilir.
- **Boşluk:** Trim uygulanmaz; baştaki/sondaki boşluk
  kasten korunur.
- **Placeholder'lar:** `{{variableName}}` formatı (i18next
  uyumlu). Değişken isimleri `camelCase` veya `snake_case`.
- **HTML:** Çevirilerde HTML etiketi kullanılmaz. Markup
  gerekiyorsa `Trans` component'i veya `dangerouslySetInnerHTML`
  (güvenli sanitization ile).
- **Karakter kaçışı:** JSON dosyalarında `\\` `\"` `\n` gibi
  kaçışlar doğru yapılır.

## 8. AI Bilgi Havuzu Entegrasyonu

Çeviri anahtarları RAG chunk'larına bölünür (Faz 11+):

```yaml
- chunk_id: i18n-tr-TR-common
  source: packages/i18n/src/locales/tr-TR.json
  type: i18n
  locale: tr-TR
  module: common
  last_verified_at: 2026-07-30
  keywords:
    - kaydet
    - iptal
    - sil
    - düzenle
    - oluştur
```

AI asistanı "X butonu ne renkli?" gibi sorulara çeviri bağlamı
üzerinden yanıt verebilir.

## 9. Erişilebilirlik (a11y) ile İlişki

- **Sağ-sol yönü (RTL):** Pilot'ta yalnızca LTR diller var.
  Arapça (Faz 14+) eklendiğinde `dir="rtl"` desteği
  gelecek.
- **Yazı tipi:** Latin ve Kiril alfabeleri için font
  ayrımı yapılır (Türkçe karakterler Latin setinde
  mevcut). Arapça için ayrı font yüklemesi gerekir (Faz 14+).
- **Erişilebilirlik metinleri:** `aria-label` ve `aria-describedby`
  değerleri de i18n sözlüğüne dahil edilir. Örnek:
  `a11y.close_menu`, `a11y.required_field_indicator`.

## 10. Kullanım Örnekleri

### Server component (RSC)

```tsx
import { getLabels } from "@/lib/labels";

export default function Page({ params }: { params: { locale: string } }) {
  const labels = getLabels(params.locale);
  return <h1>{labels.health.title}</h1>;
}
```

### API hata yanıtı

```json
{
  "error_code": "TR_AUTHZ_0001",
  "message": "Bu işlem için yetkiniz bulunmuyor.",
  "message_key": "error.TR_AUTHZ_0001",
  "locale": "tr-TR"
}
```

İstemci `message_key`'i yerelleştirmede kullanabilir, `message`'i
doğrudan gösterebilir.

### Server-side formatlama (ülke)

```ts
// apps/api/src/common/adapters/adapter.registry.ts
const adapter = getCountryAdapter(tenant.country);
const formatted = adapter.formatCurrency(1234.56);
// TR: "1.234,56 ₺"
// GB: "£1,234.56"
```

## 11. Test

- `pnpm i18n:check` — anahtar parity doğrulaması (CI).
- `pnpm test` (her paket) — çeviri çağrılarının mock'lanması.
- Manuel test: locale değiştirildiğinde tüm sayfaların
  güncellenmesi.
- Snapshot test: önemli sayfaların render çıktısı her iki
  dilde saklanır.

## 12. Gözlem ve İyileştirme

- **Eksik çevri tespiti:** Runtime'da eksik anahtar
  loglanır (warning seviyesi). Faz 14'te kullanıcı
  deneyimi için kritik anahtarlar error seviyesine
  yükseltilir.
- **Kullanım istatistikleri:** Çeviri anahtarlarının
  kullanım sıklığı (kullanıcı başına dil tercihleri) Faz 11+
  toplanır. Yeni dil açılırken bu veri kullanılır.
- **Çeviri kalitesi:** Pilot'ta çevirmen = geliştirici.
  Faz 14+ ile profesyonel çeviri süreci (gözden geçiren
  çevirmen, AI destekli çeviri önerisi).

## İlgili dokümanlar

- [`COUNTRY_ADAPTER_CONTRACT.md`](./COUNTRY_ADAPTER_CONTRACT.md) —
  ülke bazlı iş kuralları adaptörü.
- `packages/contracts/src/locale.ts` — desteklenen locale'ler.
- `packages/i18n/src/locales/` — çeviri dosyaları.
- `apps/web/src/lib/labels.ts` — UI etiket kütüphanesi.
- `tools/i18n-check/` — parity doğrulama aracı.
- `docs/ai/AI_KNOWLEDGE_BASE.md` — RAG chunk yapısı.
