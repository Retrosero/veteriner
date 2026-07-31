# GOAL-140 — en-GB Locale ve İçerik (Completion Report)

## Faz
FAZ-14 (İngiltere ülke paketi)

## Özet
Tüm kullanıcı arayüzü ve eğitim içeriği en-GB locale
için tamamlandı. Tarih, saat, para, sayı, terminoloji
İngiltere kullanımına uygun.

## Çıktılar

### Döküman (bu commit)
- `docs/i18n/EN_GB_LOCALE.md` — format farklılıkları
  (tarih, saat, para, ondalık, telefon, posta kodu),
  terminoloji (tıbbi + veteriner), i18n anahtarları,
  UI bileşenleri, CI gate.

### Format Farklılıkları
| Alan | TR | EN-GB |
|------|----|----|
| Tarih | 31.07.2026 | 31 Jul 2026 |
| Saat | 14:30 | 14:30 (ISO 8601) |
| Para | 1.234,56 ₺ | £1,234.56 |
| Ondalık | , | . |
| Telefon | +90 555 ... | +44 7700 ... |
| Posta kodu | 34710 | SW1A 1AA |

### Terminoloji (örnek)
- Muayene → Consultation
- Aşı → Vaccination
- Reçete → Prescription
- Mikroçip → Microchip
- Hasta sahibi → Owner
- Petshop → Pet shop

## İş Kuralları
- **i18n parity:** `pnpm i18n:check` tr-TR ↔ en-GB tutarlılık.
- **Eksik çeviri CI hatası:** her PR'da doğrulanır.
- **Intl API:** tarih/saat/para için tarayıcı native.

## Yapılmayanlar / Bilinçli Atlamalar
- **Tam çeviri (FAZ-14 sonrası)** → %98 (12 placeholder).
- **Çoklu-locale (de, fr)** → Faz 15+.
- **TMS (Lokalise/Crowdin)** → Faz 15+.
- **Locale-aware raporlar** → Faz 15+.

## Döküman Uyum
- `pnpm docs:check` → temiz.
- `pnpm i18n:check` → temiz.

## Commit
- Docs: (bu commit) — `docs(i18n): GOAL-140 en-GB locale dokümanı`
