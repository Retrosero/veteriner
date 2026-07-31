# GOAL-110 — Sayfa Kataloğu (Completion Report)

## Faz
FAZ-11 (Dokümantasyon ve AI asistanı temeli)

## Özet
Tüm mevcut frontend route'ları makinece okunabilir sayfa
kataloğuna bağlandı. Her sayfa için amaç, roller, izinler,
alanlar, eylemler, hata durumları, ilgili API ve yardım
anahtarları yazıldı.

## Çıktılar

### Sayfa Kataloğu (`docs/pages/`)
- **Mevcut (FAZ-0):** `web.app.locale.yaml`, `web.app.locale.dashboard.yaml`,
  `web.app.locale.health.yaml`, `web.app.locale.login.yaml`.
- **Bu commit:** 5 yeni sayfa kataloğu
  - `web.app.locale.clinic.owners.yaml` (sahip listesi)
  - `web.app.locale.clinic.patients.yaml` (hayvan listesi)
  - `web.app.locale.clinic.calendar.yaml` (klinik takvimi)
  - `web.superadmin.locale.error-center.yaml` (FAZ-10)
  - `web.superadmin.locale.job-runs.yaml` (FAZ-10)
  - `web.superadmin.locale.security-events.yaml` (FAZ-10)
  - `web.superadmin.locale.log-retention.yaml` (FAZ-10)

### Şema
- `docs/pages/PAGE_SCHEMA.md` — tüm sayfalar bu şemaya uygun
  (page_id, route, module, title_key, purpose, allowed_roles,
  required_permissions, prerequisites, fields, actions,
  step_by_step, possible_errors, related_pages, related_api,
  keywords, version, last_verified_at).

## İş Kuralları
- Her sayfa `page_id`'si `dosya adı` ile aynı olmalı.
- `module` enum: `landing | health | dashboard | clinic | petshop | finance | settings | auth | superadmin`.
- `allowed_roles`: `SUPERADMIN | OWNER | VETERINARIAN | STAFF | PET_OWNER_PORTAL`.
- `required_permissions`: `<domain>:<resource>:<action>` formatında.
- `fields` zorunlu alanlar `required: true` işaretli.
- `possible_errors` VET-XXX-NNNN kodu + çözüm içerir.

## Yapılmayanlar / Bilinçli Atlamalar
- **Mobil native ekran katalogları** → FAZ-12+ (api.<app>.*).
- **Her sayfanın tam route'u** → pilot FAZ-12'de eklenecek; şu
  an ana sayfalar var, tüm leaf'ler kapsam dışı.
- **i18n key parity (title_key, label_key)** → her sayfanın
  i18n dosyalarında karşılığı olmalı; bu Faz 14 (en-GB
  lokalizasyonu) kapsamında netleşir.

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen sayfalar özgü).
- `pnpm i18n:check` → temiz.

## Testler
- Pages için otomatik test yok (statik YAML).
- CI `pnpm docs:check` schema doğrulaması yapar.

## Commit
- Docs: (bu commit) — `docs(pages): GOAL-110 sayfa kataloğu genişletme`
