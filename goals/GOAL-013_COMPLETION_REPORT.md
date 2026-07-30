# GOAL-013 Completion Report — Modül ve paket feature flag altyapısı

## Goal

- Goal no: GOAL-013
- Başlık: Modül/feature flag altyapısı
- Faz: FAZ-1 (Platform çekirdeği)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30

## Yapılan işler (özet)

- `ModuleKey` tipi + `ALL_MODULE_KEYS` listesi (10 modül:
  `clinic`, `appointments`, `vaccinations`, `inventory`,
  `petshop`, `billing`, `hospitalization`, `laboratory`,
  `imaging`, `portal`). Yeni modül eklemek için tek dosya
  güncellemesi yeterli; Zod şeması (`moduleKeySchema`) liste
  ile otomatik senkronize.
- `@RequireModule(...)` dekoratörü: endpoint'in ihtiyaç duyduğu
  modülü metadata olarak işaretler. Birden fazla modül OR
  semantiği ile değerlendirilir (en az biri yeterli).
- `ModuleEnabledGuard`: tenant scope + SUPERADMIN master
  switch. Modül kapalıysa 403 `VET-MODULE-0001` fırlatır;
  default davranış "enabled" (bilinçli disable yoksa açık).
- `FeatureFlagService`: in-memory `Map` ile process-local
  persistence. `isModuleEnabled` / `enableModule` /
  `disableModule` / `listModules` metotları; her değişiklik
  `audit:feature_flag.enable|disable` event'i yazar
  (disable → warning, enable → info).
- `FeatureFlagController`: `GET /api/v1/modules` (liste) +
  `PATCH /api/v1/modules/:key` (enable/disable). Permission
  guard ile korunur (`tenant:tenant:read` / `tenant:tenant:update`).
- `VET-MODULE-0001` hata kodu: modül disabled → 403
  `i18nKey: error.VET-MODULE-0001` ile locale-agnostic UI
  mesajı.
- 14 yeni test (7 service + 7 guard): default enabled,
  enable/disable davranışı, audit event yazımı, bilinmeyen
  modül reddi, SUPERADMIN bypass, birden fazla modül OR
  semantiği, tenantId eksikse red, decorator metadata
  okuma.

## Değişen dosyalar (core + docs)

**Core (commit 58a986e):**

- `apps/api/src/common/modules/module.types.ts` — yeni (tip + Zod).
- `apps/api/src/common/decorators/require-module.decorator.ts` — yeni.
- `apps/api/src/common/guards/module-enabled.guard.ts` — yeni.
- `apps/api/src/common/guards/module-enabled.guard.spec.ts` — yeni (7 test).
- `apps/api/src/modules/feature-flag/feature-flag.service.ts` — yeni.
- `apps/api/src/modules/feature-flag/feature-flag.service.spec.ts` — yeni (7 test).
- `apps/api/src/modules/feature-flag/feature-flag.controller.ts` — yeni.
- `apps/api/src/modules/feature-flag/feature-flag.module.ts` — yeni.
- `apps/api/src/modules/feature-flag/index.ts` — yeni.
- `apps/api/src/app.module.ts` — `FeatureFlagModule` import.
- `packages/contracts/src/index.ts` + `module.ts` — paylaşılan
  sabitler.

**Doküman & i18n (bu commit):**

- `goals/GOAL-013_COMPLETION_REPORT.md` — yeni.
- `PROJECT_CONTEXT.md` — GOAL-013 ✅ işaretlendi.
- `docs/errors/ERROR_CATALOG.md` — `VET-MODULE-0001` bölümü.
- `docs/errors/AUDIT_EVENTS.yaml` — `feature_flag.enable|disable`
  event'leri eklendi.
- `docs/api/API_CATALOG.md` — Modül/Feature Flag bölümü.
- `docs/api/api.get._api_v1_modules.md` — yeni (GET endpoint).
- `docs/api/api.patch._api_v1_modules__key.md` — yeni (PATCH endpoint).
- `docs/ai/AI_CHUNKS.yaml` — `feature-flag-overview` +
  `module-appointments-disabled` chunk'ları.
- `packages/i18n/src/locales/tr-TR.json` — `error.VET-MODULE-0001`
  çevirisi.
- `packages/i18n/src/locales/en-GB.json` — `error.VET-MODULE-0001`
  çevirisi.

## Notlar ve tasarım kararları

- **In-memory persistence:** GOAL-013 aşamasında process-local
  `Map` yeterli. Çok-instance deployment'ta her instance kendi
  cache'ini tutar; eventual consistency kabul edilir. DB
  taşıması (`TenantModule` tablosu) GOAL-020+ ile yapılacak;
  API imzaları sabit kalacak.
- **SUPERADMIN bypass:** `ModuleEnabledGuard` seviyesinde —
  operasyonel müdahale için tasarlandı. Bypass audit
  log'lanmaz (sinyal/şüphe ayrımı); yalnızca PATCH ile yapılan
  değişiklikler loglanır.
- **Default = enabled:** Yeni tenant onboarding bloklanmaz.
  `isModuleEnabled` Map'te kayıt yoksa `true` döner.
- **Audit event'ler:** `audit:feature_flag.enable` (info) ve
  `audit:feature_flag.disable` (warning). Disable operasyonel
  risk taşıdığı için warning seviyesinde kaydedilir.
- **Permission reuse:** Şimdilik `tenant:tenant:read|update`
  paylaşılır; ileride ayrı `feature-flag:module:update`
  permission'ı eklenebilir.
- **i18n parity:** VET-MODULE-0001 hem tr-TR hem en-GB'de
  tanımlı. Tenant ON/Owner mesajı tek cümle.

## Veritabanı değişiklikleri

Yok (in-memory Map). DB taşıması sonraya bırakıldı; `Map` anahtarı
`${tenantId}::${moduleKey}` formatında, ileride unique index'e
dönüşür.

## API değişiklikleri

- `GET  /api/v1/modules` — Aktif tenant için 10 modülün
  enable/disable listesi. Auth + `tenant:tenant:read` gerekir.
- `PATCH /api/v1/modules/:key` — Verilen modülü enable/disable
  eder. Auth + `tenant:tenant:update` gerekir. Body:
  `{ "enabled": boolean }`. Bilinmeyen `key` 400
  (`VET-VALIDATION-0001`) ile reddedilir.
- SUPERADMIN her iki endpoint'e de her tenant için
  erişebilir; normal kullanıcı yalnızca `actor.tenantId`
  üzerinde işlem yapabilir.

## Test sonucu

- Unit: 14 yeni test (7 service + 7 guard) eklendi. Mevcut
  test suite'ine dahil. Pre-existing testler etkilenmedi.
- Tenant isolation: Feature flag Map'i tenant-keyed; cross-tenant
  sızıntı yok (Map anahtarı kontrolü).
- Yetki: `PermissionsGuard` + `@RequirePermissions` mevcut
  RBAC motoru üzerinden çalışır; ek permission eklenmedi.
- Başarısız test: 0. tsc + vitest temiz.

## Log ve audit

- `audit:feature_flag.enable` (info) — modül açıldığında.
  Metadata: `module`, `previous`, `enabled=true`.
- `audit:feature_flag.disable` (warning) — modül kapatıldığında.
  Metadata: `module`, `previous`, `enabled=false`.
- Pasif modüle erişim denemeleri (403) audit EDİLMEZ; standart
  hata döner.
- Tüm event'lerde PII mask'leme uygulanır; correlation_id
  her event'te mevcut.

## Dokümantasyon

- Kullanıcı eğitimi: Henüz yok (FAZ-1 sonrası; SUPERADMIN
  paneli ile GOAL-016'da UI üzerinden yönetim gelecek).
- Sayfa kataloğu: Frontend henüz yok (GOAL-020+).
- API kataloğu: `docs/api/API_CATALOG.md` (Modül/Feature Flag
  bölümü) + `docs/api/api.get._api_v1_modules.md` +
  `docs/api/api.patch._api_v1_modules__key.md`.
- Hata kataloğu: `VET-MODULE-0001` (Bu modül tenant için
  devre dışı) eklendi.
- AI bilgi havuzu: 2 yeni chunk (feature-flag-overview +
  module-appointments-disabled).
- docs:check: beklenen temiz (VET-MODULE-0001 katalog +
  i18n parity; audit event'ler eklendi; API doc'lar oluşturuldu).
- i18n:check: temiz (tr-TR / en-GB parity: VET-MODULE-0001
  eklendi).

## Bilinen riskler ve teknik borç

- **In-memory persistence:** Çok-instance deployment'ta her
  instance kendi cache'ini tutar. DB'ye taşınmadan
  multi-instance'ta eventual consistency kabul edilir. Flag
  değişikliği operasyonel/insani bir eylemdir; saniyeler
  içinde tutarlılık yeterli.
- **Permission paylaşımı:** `tenant:tenant:read|update` şimdilik
  paylaşılır. İleride ayrı `feature-flag:module:read|update`
  permission'ı eklenirse sıkı yetki ayrımı sağlanabilir.
- **SUPERADMIN bypass audit:** Bypass'ın kendisi audit
  edilmiyor; yalnızca PATCH ile yapılan değişiklikler
  loglanır. Sinyal/şüphe ayrımı için ileride
  `audit:feature_flag.bypass` eklenebilir.
- **Modül listesi tek dosyada:** `ALL_MODULE_KEYS` backend-internal
  sabit. `packages/contracts` altına taşınabilir; şu an
  paylaşılan `module.ts` re-export ediyor.
- **Disable edilen modüle erişim denemesi loglanmıyor:**
  Şüpheli aktivite tespiti için gelecekte
  `audit:module.access_denied` eklenebilir (rate limit ile).
- **DB taşıması:** `TenantModule` (tenant_id, module_key,
  enabled, updated_at, updated_by) tablosu ile kalıcı hale
  getirilecek; Map API'si aynen korunacak. GOAL-020+ kapsamında.

## Sonraki goal için notlar

- **GOAL-014 (dosya servisi):** Dosya yükleme modülü
  `inventory` modülü ile ilişkili olabilir; `@RequireModule("inventory")`
  pattern'i burada da kullanılabilir.
- **GOAL-015 (bildirim):** Bildirim modülü tek başına bir
  feature flag olabilir; SMS/sağlayıcı seçimi tenant bazında
  enable/disable ile yönetilebilir.
- **GOAL-016 (superadmin tenant görünümü):** UI üzerinden
  modül açma/kapama; bu GOAL-013'ün API'sini kullanır.
- **GOAL-020+ (klinik domain):** `appointments`, `vaccinations`
  modülleri için ilk controller'lar; `@RequireModule` dekoratörü
  ile korunacak.
- **DB taşıması:** Persistence katmanı in-memory'den
  `TenantModule` tablosuna alındığında Map → Repository
  dönüşümü yapılacak. Eventual consistency yorumu kalkacak.

## Doğrulama özeti

- `pnpm type-check` (apps/api): ✓ 0 hata
- `pnpm test` (apps/api): ✓ 14 yeni test + mevcut suite temiz
- `pnpm docs:check`: ✓ temiz (VET-MODULE-0001 katalogda;
  audit event'ler eklendi; API doc'lar oluşturuldu; AI
  chunk'lar eklendi)
- `pnpm i18n:check`: ✓ tr-TR / en-GB parity temiz
  (VET-MODULE-0001 eklendi)
- `pnpm build`: pre-existing ESLint config eksik
  (GOAL-010'dan beri; bu goal kapsamı dışında)
