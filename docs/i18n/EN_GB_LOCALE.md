# en-GB Locale ve İçerik (GOAL-140)

## Faz

FAZ-14 (İngiltere ülke paketi)

## Amaç

Tüm kullanıcı arayüzünü ve kullanıcı eğitim içeriğini
en-GB locale ile tamamla. Tarih, saat, para, sayı ve
terminoloji İngiltere kullanımına uygun olmalı. Eksik
çeviri CI hatası üretmeli.

## Yerelleştirme Kapsamı

### Format Farklılıkları (TR vs EN-GB)

| Alan              | TR                        | EN-GB                       |
| ----------------- | ------------------------- | --------------------------- |
| **Tarih**         | `GG.AA.YYYY` (31.07.2026) | `DD MMM YYYY` (31 Jul 2026) |
| **Saat**          | `24h` (14:30)             | `24h` (14:30) — ISO 8601    |
| **Para**          | `1.234,56 ₺`              | `£1,234.56`                 |
| **Ondalık**       | `,` (virgül)              | `.` (nokta)                 |
| **Binlik**        | `.` (nokta)               | `,` (virgül)                |
| **Adres**         | `Caferağa Mah. ...`       | `123 High Street, ...`      |
| **Telefon**       | `+90 555 555 0000`        | `+44 7700 900123`           |
| **Posta kodu**    | `34710`                   | `SW1A 1AA`                  |
| **ISO ülke kodu** | `TR`                      | `GB`                        |
| **Para birimi**   | `TRY`                     | `GBP`                       |
| **Saat dilimi**   | `Europe/Istanbul`         | `Europe/London`             |
| **İlk gün**       | Pazartesi                 | Pazartesi (RN: ISO 8601)    |

### Terminoloji (Tıbbi)

| TR            | EN-GB                          |
| ------------- | ------------------------------ |
| Muayene       | Consultation / Examination     |
| Aşı           | Vaccination                    |
| Tedavi        | Treatment                      |
| Reçete        | Prescription                   |
| Mikroçip      | Microchip                      |
| Sahiplik      | Ownership                      |
| Hasta sahibi  | Owner / Pet owner              |
| Hayvan        | Patient / Animal               |
| Tür (species) | Species                        |
| Irk           | Breed                          |
| Doz           | Dose                           |
| Yan etki      | Adverse reaction / Side effect |
| Stok          | Stock / Inventory              |
| Satış         | Sale                           |
| İade          | Refund / Return                |
| Tahsilat      | Payment / Collection           |
| Kasa          | Till / Cash register           |
| Petshop       | Pet shop / Retail              |

### Terminoloji (Veteriner)

| TR              | EN-GB                    |
| --------------- | ------------------------ |
| Veteriner hekim | Veterinary surgeon / Vet |
| Hemşire         | Veterinary nurse         |
| Resepsiyon      | Receptionist             |
| Klinik yönetimi | Practice manager         |
| Branş           | Branch / Site            |

## i18n Anahtarları

Yeni i18n anahtarları `packages/i18n/src/locales/en-GB.json`'a
eklenir. Mevcut anahtarlar (FAZ-3'ten) zaten İngilizce
hazır; eklenmesi gerekenler:

- Tarih/saat formatları.
- Para formatları (£, GBP).
- Telefon/posta kodu validasyonları.
- Tıbbi terminoloji çevirileri.

## Eksik Çeviri CI Hatası

`pnpm i18n:check` zaten tr-TR ve en-GB parity kontrolü
yapar. Eksik anahtar → hata. Pilot kapsamda:

- 600+ i18n anahtarı.
- tr-TR: %100.
- en-GB: %98 (12 anahtar placeholder, kalan GOAL-140
  sonrası).

## UI Bileşenleri (Next.js i18n)

- `apps/web/src/lib/i18n.ts` — IntlProvider.
- Tarih: `Intl.DateTimeFormat('en-GB', {...})`.
- Para: `Intl.NumberFormat('en-GB', { style: 'currency',
currency: 'GBP' })`.
- Çeviri: `useTranslation()` hook (react-i18next).

## CI Gate

`pnpm i18n:check` her PR'da çalışır; eksik çeviri → kırmızı.

## Yapılmayanlar / Bilinçli Atlamalar

- **Tam çeviri (FAZ-14 sonrası)** → %100 en-GB
  kapsamayacak (placeholder'lar pilot için yeterli).
- **Çoklu-locale (de, fr, vb.)** → Faz 15+ (ek ülke
  paketleri).
- **i18n çeviri yönetim sistemi (TMS)** → Faz 15+
  (Lokalise/Crowdin entegrasyonu).
- **Locale-aware raporlar** → Faz 15+ (raporlar
  tenant.locale'den alır).

## Commit

- Docs: (bu commit) — `docs(i18n): GOAL-140 en-GB locale dokümanı`
- Code: `packages/i18n/src/locales/en-GB.json` (eksik
  anahtarlar FAZ-14 ile birlikte).
