# GOAL-016 Completion Report — Superadmin tenant görünümü

## Goal

- Goal no: GOAL-016
- Başlık: Superadmin tenant görünümü
- Faz: FAZ-1 (Platform çekirdeği)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30

## Yapılan işler (özet)

- **SuperadminService** (`apps/api/src/modules/superadmin/superadmin.service.ts`):
  - `listTenants(page, pageSize, filters)` — tenant listesi
    (status/country/search filtreleri + sayfalama).
  - `getTenantDetail(tenantId)` — tek tenant için aggregation
    (branchCount, userCount, enabledModules, lastLoginAt,
    errorCountLast24h, storageUsedMb) + son 10 audit event.
  - `getRecentEvents(tenantId, limit)` — AuditEvent'ten son N event.
  - Internal `buildOverview` 4 paralel sorgu ile branch count,
    user count, son login ve storage aggregate'lerini toplar.
- **SuperadminController** — 3 endpoint:
  - `GET /api/v1/superadmin/tenants` (filtre + sayfalama)
  - `GET /api/v1/superadmin/tenants/:id` (detay + recentEvents)
  - `GET /api/v1/superadmin/tenants/:id/events` (son N event)
- **Sözleşme** (`packages/contracts/src/superadmin.ts`): `TenantOverview`,
  `AuditEventSummary`, `TenantDetailResponse`, `ListSuperadminTenantsResponse`,
  `listSuperadminTenantsQuerySchema` (Zod ile validasyon).
- **SuperadminModule** + `index.ts` barrel.
- **8 yeni test** (`superadmin.service.spec.ts`): happy path (list,
  detail, events), filter (status/country/search), pagination,
  errorCountLast24h stub, storageUsedMb BigInt→MB dönüşümü,
  cross-tenant 404 (VET-TENANT-0001), parallel aggregation race
  durumu.

## Değişen dosyalar (core + docs)

**Core (commit b74c5de):**

- `apps/api/src/modules/superadmin/superadmin.controller.ts` — yeni.
- `apps/api/src/modules/superadmin/superadmin.service.ts` — yeni.
- `apps/api/src/modules/superadmin/superadmin.module.ts` — yeni.
- `apps/api/src/modules/superadmin/superadmin.types.ts` — yeni.
- `apps/api/src/modules/superadmin/superadmin.service.spec.ts` — yeni (8 test).
- `apps/api/src/modules/superadmin/index.ts` — yeni.
- `apps/api/src/app.module.ts` — `SuperadminModule` import.
- `packages/contracts/src/superadmin.ts` + `index.ts` — paylaşılan Zod şemaları.

**Doküman & i18n (bu commit):**

- `goals/GOAL-016_COMPLETION_REPORT.md` — yeni (bu dosya).
- `PROJECT_CONTEXT.md` — GOAL-016 ✅ + **FAZ-1 tamamlandı** işaretlendi.
- `docs/api/api.get._api_v1_superadmin_tenants.md` — yeni.
- `docs/api/api.get._api_v1_superadmin_tenants__id.md` — yeni.
- `docs/api/api.get._api_v1_superadmin_tenants__id_events.md` — yeni.
- `docs/api/API_CATALOG.md` — Superadmin bölümü eklendi.
- `docs/ai/AI_CHUNKS.yaml` — 2 yeni chunk (`superadmin-tenant-overview`,
  `superadmin-suspicious-activity`).
- `docs/user-education/SUPERADMIN.md` — "GOAL-016 superadmin tenant
  görünümü" bölümü eklendi (listeleme, detay, son olaylar, SSS).

## 🎉 FAZ-1 KAPANIŞ

Tüm FAZ-1 (GOAL-010 → GOAL-016) tamamlandı:

- ✅ GOAL-010 — tenant ve şube altyapısı
- ✅ GOAL-011 — kimlik doğrulama ve oturum yönetimi
- ✅ GOAL-012 — RBAC ve izin motoru
- ✅ GOAL-013 — modül ve paket feature flag altyapısı
- ✅ GOAL-014 — dosya ve medya servisi
- ✅ GOAL-015 — bildirim altyapısı temeli
- ✅ GOAL-016 — superadmin tenant görünümü

Platform çekirdeği (multi-tenant + auth + RBAC + feature flag +
file service + notification + superadmin) üretime hazır.

**Sıradaki:** FAZ-2 — Klinik domain (GOAL-020+).

## Notlar ve tasarım kararları

- **SUPERADMIN bypass:** `PermissionsGuard` + `RbacService`
  `isSuperadmin=true` olan kullanıcılara tüm permission'ları
  otomatik verir. `X-Actor-Role: SUPERADMIN` header'ı yerine
  JWT actor payload'ı kaynak olur (FAZ-1'de test header, üretimde
  JWT).
- **Cross-tenant 404:** Tenant ID bilinmeyen/eksik değerler için
  `VET-TENANT-0001` (404) fırlatılır; bilgi sızdırmaz red.
- **In-memory aggregation:** DB view katmanı yok; her tenant için
  branch/user/lastLogin/storage sorguları service içinde paralel
  çalışır. Pilot ölçekte (10-100 tenant) yeterli; FAZ-3+'da
  materialized view + cache (Redis) eklenecek.
- **`errorCountLast24h` stub:** FAZ-1'de log aggregation altyapısı
  olmadığı için sabit `0` döner. FAZ-3+'da Loki/Prometheus'tan
  çekilecek; UI'da "henüz hesaplanmadı" badge'i gösterilebilir.
- **`storageUsedMb`:** `FileMeta.sizeBytes` (BigInt) toplamı →
  MB (1 MB = 1024² byte). Arşivlenen dosyalar (`archivedAt != null`)
  DAHİL değildir (mevcut kullanım).
- **`lastLoginAt`:** Tenant'ın tüm kullanıcıları arasında
  en yeni `User.lastLoginAt`. Hiç login yoksa `null`.
- **Recent events:** `AuditEvent` tablosundan son 10 kayıt;
  tarih azalan. Detay response'unda `recentEvents` alanına,
  ayrı endpoint'te ise `{ items: [...] }` zarfına sarılır.
- **Feature flag entegrasyonu:** Enabled modules listesi
  `FeatureFlagService.listModules(tenantId)` üzerinden gelir;
  bu servis `defaultEnabled=true` semantiği uygular (explicit
  disable kaydı yoksa "enabled" kabul).
- **PII:** Response'da `taxId`/`contactEmail` YOK. Sadece tenant
  adı, slug, ülke, durum, count metrikleri döner. Audit event
  özetinde `actorId` (UUID) döner; user.displayName gibi PII
  alanları UI katmanında mask'lenir.

## Veritabanı değişiklikleri

Yok. FAZ-1 kapsamında yeni tablo/view yok; sadece mevcut
`Tenant` / `Branch` / `User` / `UserTenantMembership` / `FileMeta` /
`AuditEvent` tablolarına okuma sorguları.

İleride (FAZ-3+): `tenant_overview` materialized view (5 dk refresh)

- `tenant_storage_daily` daily aggregate tablosu planlanıyor.

## API değişiklikleri

- `GET /api/v1/superadmin/tenants` — Tüm tenant'ların özet
  görünümü. Auth + `audit:log:read` (SUPERADMIN bypass).
  Query: `page` (default 1), `pageSize` (default 20, max 100),
  `status?`, `country?`, `search?`. 200 → `ListSuperadminTenantsResponse`.
- `GET /api/v1/superadmin/tenants/:id` — Tek tenant detayı +
  son 10 audit event. 200 → `TenantDetailResponse`. 404 →
  `VET-TENANT-0001`.
- `GET /api/v1/superadmin/tenants/:id/events` — Son 10 audit
  event. 200 → `{ items: AuditEventSummary[] }`.

## Test sonucu

- Unit: 8 yeni test (`superadmin.service.spec.ts`).
- Tenant isolation: cross-tenant 404 senaryosu (1 test).
- Negative path: aggregation'da yarış durumunda 404 (1 test),
  filter sonuç boş döner (1 test).
- Başarısız test: 0.

## Log ve audit

- Okuma endpoint'leri şu an audit event YAZMAZ (performans için).
  İleride (FAZ-3+) `audit:superadmin.tenant.read` (info) eklenecek.
- Yanıt hatalarında (403/404) mevcut `audit:auth.permission_denied`
  ve `audit:security.cross_tenant_attempt` eventleri RBAC
  altyapısı tarafından otomatik yazılır.

PII maskeleme response'da zaten uygulanmış (taxId/contactEmail
response alanı yok). Audit event'lerde actorId UUID olarak döner.

## Dokümantasyon

- Kullanıcı eğitimi: `docs/user-education/SUPERADMIN.md`
  güncellendi (GOAL-016 bölümü: listeleme, detay, son olaylar, SSS).
- Sayfa kataloğu: Superadmin UI henüz yok; API kullanımı anlatıldı.
- Alan sözlüğü: yeni alan yok (mevcut TenantOverview alanları
  `docs/fields/FIELD_GLOSSARY.md`'de tanımlı).
- Hata kataloğu: `VET-TENANT-0001` (mevcut) cross-tenant 404
  için yeterli; yenisi gerekmedi.
- AI bilgi havuzu: 2 yeni chunk (`superadmin-tenant-overview`,
  `superadmin-suspicious-activity`).
- API kataloğü: 3 yeni endpoint doc + `API_CATALOG.md` bölümü.

## Bilinen riskler

- **`errorCountLast24h` her zaman 0:** UI'da "veri yok" olarak
  görünür; production'da alert vermemeli (metric henüz hesaplanmıyor).
- **Aggregation maliyeti:** Sayfa başına N paralel sorgu +
  her tenant için ek 4 sorgu. 100 tenant × 20 page = 400+ sorgu
  potansiyel. FAZ-2'de `Promise.all` semafor / connection pool
  limiti eklenebilir.
- **Search performansı:** `mode: "insensitive"` + `contains`
  index kullanmaz. 1000+ tenant ölçeğinde FAZ-3'te pg_trgm
  index eklenmeli.
- **Audit event yazılmaması:** Superadmin'in tenant verisini
  okuması iz bırakmaz. FAZ-3+'da `audit:superadmin.tenant.read`
  eklenecek; pilot için kabul edilebilir risk.

## Teknik borç

- DB view / materialized view katmanı (FAZ-3+).
- Loki/Prometheus bağlantısı (`errorCountLast24h` gerçek değer).
- UI ekranı (Faz 16+).
- `audit:superadmin.tenant.read` event'i (FAZ-3+).

## Sonraki goal için notlar

- **GOAL-020 (Hasta sahibi kayıt ve arama):** Klinik domain
  başlangıcı. `PatientOwner` + `OwnerSearch` modülü; tenant
  izolasyonu + RBAC + audit aynen uygulanır.
- **FAZ-2 checklist:** Klinik temel modülleri (owner, patient,
  ownership, allergies, timeline) → ardından randevu/portal.
- **Superadmin UI:** Faz 16 (GOAL-103 superadmin hata merkezi
  ile birlikte) geliyor; bu API'leri tüketecek.
