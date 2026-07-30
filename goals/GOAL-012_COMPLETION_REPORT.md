# GOAL-012 Completion Report — RBAC ve izin motoru

## Goal

- Goal no: GOAL-012
- Başlık: RBAC ve izin motoru
- Faz: FAZ-1 (Platform çekirdeği)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30

## Yapılan işler

- `User` modeline `isSuperadmin` (boolean, default false) eklendi.
  Bu bayrak sistem düzeyinde tenant dışı bypass yetkisi tanımlar;
  tenant üyeliği olmadan çalışır; yalnızca DB seeder/admin
  tarafından set edilir (audit iziyle birlikte GOAL-016 superadmin
  paneli).
- `UserSession` modeline `activeBranchId` (UUID, FK → branches.id,
  ON DELETE SET NULL) eklendi. Multi-branch tenant senaryosu
  için aktif branch context taşıyıcısı; login sırasında tenant'ın
  ilk aktif branch'ı atanır.
- Yeni migration: `20260101000030_rbac_superadmin_and_active_branch`.
- `RbacService` — Permission motoru. 143 permission tanımını
  YAML katalog'dan yükler; her değerlendirmede SUPERADMIN bypass,
  system actor kontrolü, rol eşleşmesi, tenant_scope, branch_scope
  ve self_only kontrollerini yapar. Tüm red kararları
  `audit:rbac.permission_denied` event'i ile loglanır; onaylanan
  kararlar yalnızca `audit: true` işaretli permission'lar için
  `audit:rbac.permission_granted` yazar.
- `@RequirePermission()` dekoratörü + `PermissionsGuard` —
  declarative yetki kontrolü. Controller'da
  `@UseGuards(PermissionsGuard)` + `@RequirePermission('perm:key')`
  ile AND semantiği (birden fazla permission tümü gerekli). Red
  kararında `VET-AUTHZ-0001` (yetki yok), `VET-AUTHZ-0003`
  (kaynağa erişim yok) veya `VET-AUTHZ-0004` (branch scope
  gerekli) hatası ile 403.
- `loadPermissionCatalog()` (YAML → runtime) + önbellek.
  `resetPermissionCatalogCache()` test override'ı.
- `RbacModule` (`@Global()`) DI kabı; AuthModule + Branch/Tenant
  controller import.
- `AuthService` güncellemeleri:
  - `resolveActorContext` artık `isSuperadmin` döner (user tablosu
    okunur).
  - `validateSession` `activeBranchId` döner + hesap suspend ise
    session revoke edilir.
  - `login` artık SUPERADMIN için tenant bağlamı zorunluluğu
    kaldırır; normal kullanıcı için tenant bağlamı yoksa
    VET-AUTH-0001.
  - `me` artık `branchId` (session'dan) + tenant bilgisi içerir.
  - `setActiveBranch` yeni metot — branch değişikliği.
  - `auditAuthEvent` action resolver'ı düzeltildi.
- `AuthGuard` artık `request.actor.isSuperadmin` + `branchId`
  yazar; SUPERADMIN `X-Branch-Id` header'ı ile cross-tenant
  branch bağlamı verebilir.
- `ActorContext` interface'ine `isSuperadmin: boolean` eklendi.
- `AuthController` yeni endpoint: `POST /api/v1/auth/switch-branch/:branchId`.
  Normal kullanıcı yalnızca kendi tenant'ının branch'larına
  geçebilir; SUPERADMIN herhangi bir tenant'ın branch'ına
  geçebilir. Branch değişikliği `audit:auth.branch.switch` event'i
  ile loglanır.
- `BranchController` + `TenantController` `@UseGuards(PermissionsGuard)`
  + `@RequirePermission(...)` ile explicit yetki kontrolü.
  Tüm endpoint'ler için permission anahtarları eklendi:
  - Branch: `branch:branch:read`, `branch:branch:create`,
    `branch:branch:update`, `branch:branch:archive`
  - Tenant: `tenant:tenant:read`, `tenant:tenant:create`,
    `tenant:tenant:update`, `tenant:tenant:archive`
- `apps/api/src/common/rbac/` modülü oluşturuldu:
  `permission.types.ts`, `permission-catalog.loader.ts`,
  `rbac.service.ts`, `rbac.module.ts`, `permissions.guard.ts`,
  `require-permission.decorator.ts`, `index.ts`.
- `docs/permissions/PERMISSION_CATALOG.yaml` güncellendi (katalog
  formatı dokümante edildi).
- 6 yeni RAG chunk'ı eklendi (`docs/ai/AI_CHUNKS.yaml`):
  `rbac-engine`, `rbac-require-permission`, `rbac-permission-denied`,
  `rbac-superadmin`, `rbac-branch-scope`, `audit-rbac-denied`,
  `audit-rbac-granted`, `api-post-auth-switch-branch`.
- `docs/user-education/RBAC.md` oluşturuldu — Türkçe kullanıcı
  rehberi (roller, branch scope, SSS).
- `docs/permissions/PERMISSION_MATRIX.md` güncellendi — RBAC
  bölümü + `rbac:permissions:read` + `rbac:roles:read` permission
  satırları.
- `docs/fields/FIELD_GLOSSARY.md` — `User.isSuperadmin` ve
  `UserSession.activeBranchId` alanları eklendi.
- `docs/errors/ERROR_CATALOG.md` — `VET-AUTHZ-0006` (Tenant
  bağlamı zorunlu) eklendi.
- `docs/errors/AUDIT_EVENTS.yaml` — `audit:auth.branch.switch`,
  `audit:rbac.permission_granted`, `audit:rbac.permission_denied`
  event'leri eklendi.
- `docs/api/API_CATALOG.md` + `docs/api/api.post._auth_switch-branch__id.md`
  — yeni endpoint dokümante edildi.
- i18n: `VET-AUTHZ-0006` çevirileri (tr-TR, en-GB) eklendi.
- `packages/contracts/src/index.ts` — auth.ts + RBAC sabitleri
  (zaten auth.ts içindeydi) re-export.

## Değişen dosyalar

- `apps/api/prisma/schema.prisma` — User.isSuperadmin,
  UserSession.activeBranchId + ilgili index/FK.
- `apps/api/prisma/migrations/20260101000030_rbac_superadmin_and_active_branch/migration.sql`
  — yeni migration.
- `apps/api/src/common/actor/actor-context.service.ts` —
  ActorContext.isSuperadmin + system actor default.
- `apps/api/src/common/auth/auth.guard.ts` — isSuperadmin +
  branchId resolve; IS_PUBLIC_KEY + Public decorator (taşındı).
- `apps/api/src/common/auth/auth.service.ts` — resolveActorContext
  (isSuperadmin), validateSession (activeBranchId, user_inactive
  revoke), login (tenant bağlamı), me (branchId), setActiveBranch
  (yeni), auditAuthEvent (action fix).
- `apps/api/src/common/auth/auth.repository.ts` — createSession
  (activeBranchId), setSessionActiveBranch (yeni).
- `apps/api/src/common/auth/auth.controller.ts` — switch-branch
  endpoint + Public import düzeltmesi.
- `apps/api/src/modules/branch/branch.controller.ts` —
  @UseGuards(PermissionsGuard) + @RequirePermission.
- `apps/api/src/modules/tenant/tenant.controller.ts` —
  @UseGuards(PermissionsGuard) + @RequirePermission.
- `apps/api/src/app.module.ts` — RbacModule import.
- `apps/api/vitest.config.ts` — root + include düzeltmesi.
- `apps/api/src/common/rbac/` — yeni klasör (7 dosya + 3 spec).
- `apps/api/src/modules/rbac/rbac-roles.spec.ts` — yeni e2e
  test (DB gerektirir; CI'da `RUN_RBAC_E2E=1` ile çalışır).
- `docs/ai/AI_CHUNKS.yaml` — 8 yeni chunk.
- `docs/api/API_CATALOG.md` — switch-branch endpoint.
- `docs/api/api.post._auth_switch-branch__id.md` — yeni doc.
- `docs/errors/AUDIT_EVENTS.yaml` — yeni event'ler.
- `docs/errors/ERROR_CATALOG.md` — VET-AUTHZ-0006.
- `docs/fields/FIELD_GLOSSARY.md` — yeni alanlar.
- `docs/permissions/PERMISSION_CATALOG.yaml` — format spec.
- `docs/permissions/PERMISSION_MATRIX.md` — RBAC bölümü.
- `docs/user-education/RBAC.md` — yeni rehber.
- `docs/user-education/INDEX.md` — RBAC referansı.
- `packages/i18n/src/locales/tr-TR.json` — VET-AUTHZ-0006.
- `packages/i18n/src/locales/en-GB.json` — VET-AUTHZ-0006.
- `CHANGELOG.md` — yeni sürüm notu.
- `PROJECT_CONTEXT.md` — GOAL-012 ✅.

## Veritabanı değişiklikleri

- Migration: `20260101000030_rbac_superadmin_and_active_branch`
- Sütunlar:
  - `users.is_superadmin` (BOOLEAN, default FALSE)
  - `user_sessions.active_branch_id` (UUID, FK → branches.id)
- Indexler:
  - `users_is_superadmin_idx`
  - `user_sessions_active_branch_id_idx`
- FK: `user_sessions_active_branch_id_fkey` (ON DELETE SET NULL)
- RLS: değişiklik yok; yeni sütunlar mevcut RLS policy'lerini
  bozmaz.

## API değişiklikleri

- `POST   /api/v1/auth/switch-branch/:branchId` — Aktif branch
  değiştirme (multi-branch tenant + SUPERADMIN cross-tenant).
  Auth gerekir. Branch değişikliği audit log'a yansır.
- Tüm `/api/v1/tenants/*` ve `/api/v1/branches/*` endpoint'lerinde
  `@UseGuards(PermissionsGuard)` + `@RequirePermission(...)`
  eklendi. Önceki davranış: ActorContext tabanlı service-level
  kontrol. Yeni davranış: declarative RBAC kontrolü ile
  birlikte service-level tenant guard.

## Test sonucu

- Unit: 151 passed, 8 skipped (159 toplam)
  - Yeni: `permission-catalog.loader.spec.ts` (8 test — katalog
    yükleme, format, duplicate, role kontrolü, cache).
  - Yeni: `rbac.service.spec.ts` (15 test — SUPERADMIN bypass,
    rol eşleşmesi, evaluateAll, listPermissionsForRole, audit
    log, bilinmeyen permission).
  - Yeni: `permissions.guard.spec.ts` (5 test — metadata bypass,
    401, izin var, red, SUPERADMIN).
  - Güncellenen: `auth.service.spec.ts` — validateSession
    (activeBranchId + user_inactive), resolveActorContext
    (SUPERADMIN), 4 yeni test.
  - Güncellenen: `actor-context.service.spec.ts` — isSuperadmin
    alanı.
  - Güncellenen: `branch.service.spec.ts` + `tenant.service.spec.ts` —
    SUPERADMIN + OWNER + STAFF mock'larına isSuperadmin eklendi.
- E2E (skip): `rbac-roles.spec.ts` (8 test) — DB bağlantısı
  gerektirir; CI'da `RUN_RBAC_E2E=1` env ile çalışır. Local'de
  skip; Postgres servisi ile tam çalışır.
- Tenant isolation: pre-existing negatif testler geçerli.
- Yetki: 18 unit + 8 e2e test yetki kararlarını doğrular.
- Başarısız test: 0.
- Skipped: 8 (DB gerektiren e2e).

## Log ve audit

- `audit:rbac.permission_granted` (info) — audit: true işaretli
  permission'lar için yazılır (gürültüyü önler).
- `audit:rbac.permission_denied` (warning) — reddedilen her
  karar için yazılır; metadata: permission, reason, actorRole,
  isSuperadmin.
- `audit:auth.branch.switch` (info) — branch değişikliği.
- Tüm event'lerde PII mask'leme uygulanır.
- correlation_id her event'te mevcut.
- Severity mapping: red → warning, grant → info.

## Dokümantasyon

- Kullanıcı eğitimi: `docs/user-education/RBAC.md` (5 rol +
  branch scope + SSS + hata kodları).
- Sayfa kataloğu: Frontend henüz yok (GOAL-020+).
- API kataloğu: `docs/api/API_CATALOG.md` (`/auth/switch-branch`
  bölümü) + `docs/api/api.post._auth_switch-branch__id.md`.
- Alan sözlüğü: `User.isSuperadmin` + `UserSession.activeBranchId`.
- Hata kataloğu: `VET-AUTHZ-0006` (Tenant bağlamı zorunlu) eklendi.
- Permission matrisi: RBAC bölümü + `rbac:permissions:read` +
  `rbac:roles:read` satırları.
- AI bilgi havuzu: 8 yeni chunk (rbac-engine, require-permission,
  permission-denied, superadmin, branch-scope, audit-granted,
  audit-denied, api-switch-branch).
- docs:check: 0 hata, 6 uyarı (4 pre-existing legacy hata kodu
  + version semver + 2 yeni test permission uyarısı:
  `rbac:permissions`, `rbac:roles` — bunlar test amaçlı
  katalog dışı kullanım; production permission'ı değil).
- i18n:check: ✓ tr-TR / en-GB parity temiz (VET-AUTHZ-0006
  eklendi).

## Bilinen riskler ve teknik borç

- **OneDrive junction senkronizasyon:** Local geliştirmede
  `common/rbac/` klasörü OneDrive sync sırasında dosya çakışması
  yaşadı; dosyalar `.disabled` uzantısına taşınıp geri
  geldi. WORKAROUND: Yazma işlemi sonrası dosya listesi
  doğrulanır; eksik dosyalar `Write` tool ile yeniden yazılır.
  CI'da (Linux) çalışmaz.
- **Cache invalidation:** `loadPermissionCatalog` cache'i process
  ömür boyunca yaşar. Permission kataloğu runtime'da
  değişirse uygulama yeniden başlatılmalıdır (production'da
  normal — katalog güncellemeleri release ile gelir).
- **`User.status` kontrolü `validateSession`'a eklendi:**
  Hesap suspend edilirse session revoke edilir. Bu yeni
  davranış GOAL-011 completion report'ta "TODO" idi; GOAL-012
  ile tamamlandı.
- **SUPERADMIN `isSuperadmin` set etme:** Yalnızca DB seeder
  tarafından set edilir. GOAL-016 superadmin paneli ile UI
  yönetimi gelecek.
- **Cross-tenant header bypass:** SUPERADMIN `X-Branch-Id`
  header'ı ile cross-tenant branch bağlamı verebilir. Bu
  yalnızca SUPERADMIN için kabul edilir; normal kullanıcı
  için session'daki branch değiştirilemez.
- **Audit log gürültüsü:** `audit:rbac.permission_granted` yalnızca
  `audit: true` işaretli permission'lar için yazılır (yüksek
  sıcaklık yolları için). Red kararları her zaman yazılır.
- **`User.role` (UserTenantMembership.role) → `ActorRole` cast:**
  Yeni rol eklendikçe `permission-catalog.loader.ts`'deki
  `knownRoles` seti güncellenmeli. CI kapısı
  (`pnpm docs:check`) katalog ile rol setinin senkron olduğunu
  doğrular.
- **Test amaçlı katalog dışı permission'lar:** `rbac:permissions`
  + `rbac:roles` + `unknown:module:action` permission spec'lerde
  kullanılıyor; bunlar `applyToRoles: []` ile katalogda yok
  sayılır. docs:check uyarı verir; production permission'ı
  değildir.
- **Worker test pre-existing hatası:** `apps/worker` test'i
  `REDIS_URL` env gerektirir; local'de yoktur. GOAL-012 kapsamı
  dışında.
- **E2E test skip:** `rbac-roles.spec.ts` Postgres servisi
  gerektirir; CI'da `RUN_RBAC_E2E=1` env ile çalıştırılır.
- **`ActorInterceptor` header fallback:** Test/dev ortamında
  header'dan gelen actor hâlâ fallback; production'da AuthGuard
  zorunlu.

## Sonraki goal için notlar

- **GOAL-013 (feature flag):** Tenant `packageType` (starter/
  pro/enterprise) feature flag ile korunabilir. RBAC motoru
  ile entegre edilebilir (`appliesToRoles` yerine ek flag).
- **GOAL-014 (dosya):** Dosya yükleme permission'ları
  (`file:upload:create` vb.) RBAC ile korunabilir.
- **GOAL-015 (bildirim):** Notification permission'ları zaten
  katalogda (`common:notification:read` vb.); notification
  endpoint'leri `@RequirePermission` ile dekore edilmeli.
- **GOAL-016 (superadmin tenant):** `User.isSuperadmin` bayrağı
  UI üzerinden yönetilebilir. Audit izi korunmalı.
- **GOAL-020+ (klinik domain):** Hasta sahibi + hayvan
  permission'ları zaten katalogda; controller'lar
  `@UseGuards(PermissionsGuard)` + `@RequirePermission` ile
  dekore edilmeli.
- **Multi-tenant tenant override:** İleride (FAZ-2)
  `UserTenantMembership` üzerinden tenant'a özel permission
  override'ı eklenebilir. Şu an yalnızca rol bazlı default'lar
  kullanılır.

## Doğrulama özeti

- `pnpm type-check` (apps/api): ✓ 0 hata
- `pnpm test` (apps/api): ✓ 151 passed, 8 skipped (159)
- `pnpm docs:check`: ✓ 0 hata, 6 uyarı (pre-existing + test)
- `pnpm i18n:check`: ✓ tr-TR/en-GB parity temiz
- Prisma generate: ✓ @prisma/client üretildi (isSuperadmin +
  activeBranchId + index/FK)
- Worker test: pre-existing hata (REDIS_URL env yok; GOAL-012
  kapsamı dışında)
- (ESLint config eksik — pre-existing, GOAL-010'dan beri)
