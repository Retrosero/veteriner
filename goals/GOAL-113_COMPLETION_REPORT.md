# GOAL-113 — Hata Kataloğu (Completion Report)

## Faz

FAZ-11 (Dokümantasyon ve AI asistanı temeli)

## Özet

Kullanıcıya veya teknik ekibe gösterilen tüm error code'ları
açıklayan katalog. Her hata: kod, kullanıcı mesajı, teknik
açıklama, olası neden, çözüm adımı, severity, ilgili modül
içerir.

## Çıktılar

### Hata Kataloğu (`docs/errors/`)

- **Mevcut (FAZ-4):** `ERROR_CATALOG.md` — 200+ hata kodu
  (VET-XXX-NNNN formatında), 30+ modül için organize.
- **Bu commit:** Hata kataloğu zaten kapsamlı; pilot kapsamda
  tüm hata kodları tanımlı. Faz 11'de yeni eklenen
  `VET-ERRSTAT-0001` (FAZ-10) dahil edildi.

### Yapı

- **Modül bazlı tablolar:** COMMON, VALIDATION, AUTH, AUTHZ,
  TENANT, COUNTRY, OWNER, PATIENT, APPT, EXAM, VACC, INVENTORY,
  STOCK, PRODUCT, SUPPLIER, PURCHASE, PRICING, CASH_REGISTER,
  PAYMENT, REPORT, AUDIT, FILE, NOTIF, PORTAL, INTEGRATION,
  JOB, WORKER, CLINIC, CONSENT, KVKK.
- **Her hata:** `Kod | Ad | HTTP | Severity | Kaynak | Çözüm`.

## İş Kuralları

- **Kod formatı:** `VET-<MODULE>-<NNN>` (FAZ-4 standardı).
- **HTTP standardı:** 4xx → client error; 5xx → server error.
- **Severity:** info | warning | error | critical.
- **i18n parity:** Her hata kodu `tr-TR.json` ve `en-GB.json`'da
  karşılık gelir.
- **CI doğrulaması:** `pnpm docs:check` kod tabanında
  kullanılan hata kodlarının katalogda yer almasını zorunlu
  kılar.

## Yapılmayanlar / Bilinçli Atlamalar

- **Dinamik hata kataloğu (runtime'da üretilen kodlar)** →
  FAZ-12+ (validation'dan üretilen VET-VALIDATION-NNNN'ler).
- **Müşteri-dostu çeviri (her dil için lokalize mesaj)** → bu
  i18n parity kapsamında; her hatanın tr-TR + en-GB mesajı
  vardır.

## Döküman Uyum

- `pnpm docs:check` → hata kataloğu tam (kullanılan
  kodların tümü katalogda mevcut).
- `pnpm i18n:check` → temiz (her hata kodu i18n'dedir).

## Testler

- Hata kataloğu statik Markdown; otomatik test yok.
- CI `pnpm docs:check` schema doğrulaması yapar.

## Commit

- Docs: (FAZ-4 + FAZ-10'da zaten eklendi; bu commit'te
  ekleme yok) — `docs(errors): hata kataloğu (FAZ-4) + VET-ERRSTAT-0001 (FAZ-10)`.
