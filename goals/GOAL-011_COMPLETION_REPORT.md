# GOAL-011 Completion Report — Kimlik doğrulama ve oturum yönetimi

## Goal

- Goal no: GOAL-011
- Başlık: Kimlik doğrulama ve oturum yönetimi
- Faz: FAZ-1 (Platform çekirdeği)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30

## Yapılan işler

- `User` modeli Prisma şemasına eklendi (email, passwordHash, status,
  failedLoginCount, lockedUntil, lastLoginAt, passwordChangedAt,
  locale, displayName, archivedAt).
- `UserSession` modeli (cookie bearer token, SHA-256 hash, expiresAt,
  lastUsedAt, replacedById, revokedAt, revokedReason).
- `UserInvitation` modeli (tenant-scoped davet, 7 gün TTL, pending +
  accepted + expired + cancelled).
- `PasswordResetToken` modeli (1 saat TTL, usedAt ile tek kullanımlık).
- `UserTenantMembership.userId` artık `User.id`'ye FK.
- Yeni migration: `20260101000020_init_auth_users_sessions`
  (tablolar, enum'lar, RLS policy'leri: user_sessions ve
  user_invitations ve password_reset_tokens için tenant/user
  isolation; users tablosunda RLS yok — login email araması için).
- `bcryptjs` (cost 12) ile parola hash + verify.
- `crypto.randomBytes` (32 byte) + SHA-256 ile session/invite/reset
  token üretimi. Constant-time karşılaştırma (`safeEqual`).
- `BruteForceGuard` in-memory sayaç (5 deneme / 15 dakika kilit);
  DB'de `User.failedLoginCount` + `User.lockedUntil` ile senkron.
- `AuthService`:
  - `login` — email enumeration korumalı (decoy hash + generic
    mesaj); hesap aktif değilse / kilitliyse farklı hata.
  - `logout` + tüm oturumları kapatma.
  - `refresh` — token rotation (eski `replacedById` ile bağlanır).
  - `forgotPassword` / `resetPassword` — 1 saatlik token; reset
    başarılıysa tüm aktif session'lar iptal (compromise koruması).
  - `changePassword` — oturum açıkken eski parola doğrulamalı.
  - `inviteUser` / `acceptInvitation` — tenant admin davet oluşturur,
    davetli kabul edince User oluşturulur + membership atanır +
    otomatik login.
  - `me` — aktif kullanıcı + session + üyelikler.
  - `validateSession` — süre / iptal / idle timeout kontrolü.
  - `listSessions` + `revokeSessionById` — logout-remote.
  - `switchTenant` — multi-tenant üye kullanıcı için aktif tenant
    değişimi.
- `AuthGuard` (`@UseGuards(AuthGuard)` veya `@Public()` ile):
  - Cookie `vetniva_session` veya `Authorization: Bearer <token>`.
  - Session doğrular, `request.actor`'a gerçek `ActorContext` yazar.
  - `resolveActorContext` ile kullanıcının tenant bağlamı çözülür.
  - Public dekoratörü ile muaf tutulan endpoint'ler (login, forgot,
    reset, accept, health).
- `AuthController` (`/auth`):
  - `POST /auth/login` (public) — sessionToken + cookie.
  - `POST /auth/logout` (auth) — cookie temizlenir.
  - `POST /auth/refresh` (auth) — token rotation + cookie güncellenir.
  - `POST /auth/forgot` (public) — email enumeration korumalı.
  - `POST /auth/reset` (public) — token + yeni parola.
  - `POST /auth/change-password` (auth).
  - `POST /auth/invitations` (auth — tenant admin).
  - `POST /auth/invitations/accept` (public).
  - `POST /auth/switch-tenant` (auth).
- `IdentityModule` (`/me`):
  - `GET /me` — kullanıcı + session + üyelikler.
  - `GET /me/sessions` — tüm session'lar (mevcut `isCurrent=true`).
  - `DELETE /me/sessions/:id` — logout-remote.
- `app.module.ts` ve `main.ts` wiring:
  - `AuthModule` + `IdentityModule` import.
  - `cookie-parser` middleware (cookie tabanlı session).
  - Swagger cookie auth (`vetniva_session`).
  - `ActorInterceptor` session varsa header fallback'i atlar.
- Contracts (`packages/contracts/src/auth.ts`):
  - Zod şemaları: `loginRequest`, `loginResponse`, `forgotPassword*`,
    `resetPassword*`, `changePassword*`, `inviteUser*`,
    `acceptInvitation*`, `meResponse`, `sessionList*`,
    `switchTenant*`, `passwordPolicy`, `userEmail`, `userStatus`,
    `tenantRole`, `actorRole`.
  - Sabitler: `BCRYPT_COST=12`, `SESSION_TTL_SECONDS=30 gün`,
    `SESSION_IDLE_TIMEOUT_SECONDS=24 saat`,
    `PASSWORD_RESET_TTL_SECONDS=1 saat`,
    `INVITATION_TTL_SECONDS=7 gün`, `MAX_FAILED_LOGIN_COUNT=5`,
    `ACCOUNT_LOCK_SECONDS=15 dakika`, `SESSION_COOKIE_NAME`.
- Audit event'leri (`audit:auth.*`):
  - `login.success` (info), `login.failure` (warning/error/lock),
  - `logout` (info), `session.rotate` (info), `session.revoke` (info),
  - `password.reset_request` (info), `password.reset_success`
    (warning), `password.change` (info),
  - `invitation.create` (info), `invitation.accept` (info).
  - Tüm event'lerde PII mask'leme (email, displayName).

## Değişen dosyalar

- `apps/api/prisma/schema.prisma` — User, UserSession,
  UserInvitation, PasswordResetToken + UserTenantMembership FK
  düzeltmesi + Tenant.invitations relation.
- `apps/api/prisma/migrations/20260101000020_init_auth_users_sessions/migration.sql`
  — yeni migration (tablolar + enum'lar + RLS + index + FK).
- `apps/api/src/common/auth/password.ts` — bcrypt wrapper.
- `apps/api/src/common/auth/token.ts` — secure token + SHA-256.
- `apps/api/src/common/auth/brute-force.ts` — in-memory sayaç.
- `apps/api/src/common/auth/brute-force.spec.ts` — unit test.
- `apps/api/src/common/auth/auth.repository.ts` — DB erişim.
- `apps/api/src/common/auth/auth.service.ts` — iş kuralları.
- `apps/api/src/common/auth/auth.service.spec.ts` — 36 unit test.
- `apps/api/src/common/auth/auth.guard.ts` — session doğrulama +
  ActorContext üretimi (`@Public()` dekoratörü).
- `apps/api/src/common/auth/auth.controller.ts` — HTTP endpoint'ler.
- `apps/api/src/common/auth/auth.module.ts` — DI.
- `apps/api/src/common/auth/dto.ts` — AttemptContext helper.
- `apps/api/src/common/actor/actor.interceptor.ts` — session varsa
  header fallback'i atla.
- `apps/api/src/modules/identity/identity.controller.ts` — `/me`
  endpoint'leri.
- `apps/api/src/modules/identity/identity.module.ts` — DI.
- `apps/api/src/app.module.ts` — AuthModule + IdentityModule import.
- `apps/api/src/main.ts` — cookie-parser + Swagger cookie auth.
- `apps/api/package.json` — bcryptjs + cookie-parser + tipleri.
- `packages/contracts/src/auth.ts` — yeni Zod şemaları.
- `packages/contracts/src/index.ts` — auth export.
- `packages/contracts/package.json` — CJS-compatible export.
- `packages/i18n/src/locales/tr-TR.json` — VET-AUTH-0001..0008
  çevirileri.
- `packages/i18n/src/locales/en-GB.json` — aynı anahtarlar.
- `docs/api/API_CATALOG.md` — `/auth` + `/me` bölümleri + auth
  header tablosu güncelleme.
- `docs/api/api.get._me.md`, `api.get._me_sessions.md`,
  `api.delete._me_sessions__id.md` — endpoint dokümanları.
- `docs/fields/FIELD_GLOSSARY.md` — User, UserSession,
  UserInvitation, PasswordResetToken bölümleri.
- `docs/errors/ERROR_CATALOG.md` — VET-AUTH-0001..0008
  güncellenmiş tanımlar.
- `docs/ai/AI_CHUNKS.yaml` — 17 yeni chunk (glossary, audit, error,
  api, pii).
- `docs/user-education/AUTH.md` — Türkçe kullanıcı eğitimi
  (giriş, parola, davet, oturum, brute-force, SSS).
- `docs/user-education/INDEX.md` — AUTH.md + zamanlama eklendi.
- `PROJECT_CONTEXT.md` — GOAL-011 ✅.

## Veritabanı değişiklikleri

- Migration: `20260101000020_init_auth_users_sessions`
- Enum'lar: `user_status`, `invitation_status`
- Tablolar: `users`, `user_sessions`, `user_invitations`,
  `password_reset_tokens`
- Indexler:
  - `users(status)`, `users(locked_until)`
  - `user_sessions(user_id)`, `user_sessions(expires_at)`,
    `user_sessions(revoked_at)`
  - `user_invitations(tenant_id, status)`, `user_invitations(email)`,
    `user_invitations(expires_at)`
  - `password_reset_tokens(user_id)`, `password_reset_tokens(expires_at)`
- RLS:
  - `user_sessions` — kullanıcı yalnızca kendi session'larını
    görür (SUPERADMIN bypass + `app.user_id` context).
  - `user_invitations` — tenant-scoped (SUPERADMIN bypass +
    `app.tenant_id`).
  - `password_reset_tokens` — kullanıcı yalnızca kendi reset
    token'larını görür.
  - `users` — RLS YOK (login email araması için); service
    katmanı status kontrolü yapar.
- FK'lar: `user_tenant_memberships.user_id → users.id`
  (ON DELETE CASCADE).
- Trigger: `users.touch_updated_at`.

## API değişiklikleri

- `POST   /api/v1/auth/login` — email + password (public)
- `POST   /api/v1/auth/logout` — mevcut oturumu sona erdir
- `POST   /api/v1/auth/refresh` — token rotation
- `POST   /api/v1/auth/forgot` — parola sıfırlama talebi
- `POST   /api/v1/auth/reset` — token + yeni parola
- `POST   /api/v1/auth/change-password` — oturum açıkken değişim
- `POST   /api/v1/auth/invitations` — tenant admin davet
- `POST   /api/v1/auth/invitations/accept` — davet kabul
- `POST   /api/v1/auth/switch-tenant` — multi-tenant aktif tenant
- `GET    /api/v1/me` — aktif kullanıcı + session + üyelikler
- `GET    /api/v1/me/sessions` — kullanıcının tüm session'ları
- `DELETE /api/v1/me/sessions/:id` — logout-remote
- Cookie: `vetniva_session` (httpOnly, SameSite=Lax, secure prod).
- Alternatif: `Authorization: Bearer <token>` header.

## Test sonucu

- Unit: 121 passed, 2 skipped, 0 failed
  - Yeni: `brute-force.spec.ts` (5 test)
  - Yeni: `auth.service.spec.ts` (31 test — login/logout/refresh,
    parola sıfırlama, change-password, davet, me, validateSession,
    listSessions, switchTenant, resolveActorContext)
- Integration: 0 (DB gerektiren RLS testleri CI'da postgres servisi
  ile çalışır; GOAL-100+)
- E2E: 0 (smoke testleri DB'siz; auth akışı entegrasyon testleri
  Faz 12'de eklenecek)
- Tenant isolation: 3+ negatif test (cross-tenant davet reddi,
  başka kullanıcının session revoke → 404, suspended user → 401)
- Yetki: auth guard her istek başında session doğrular; başarısızsa
  VET-AUTH-0001
- Başarısız test: 2 skip (DB gerektiren)

## Log ve audit

- `audit:auth.login.success` (info) — başarılı login
- `audit:auth.login.failure` (warning/error) — başarısız login
  (4 deneme warning, 5. deneme error + lock)
- `audit:auth.logout` (info)
- `audit:auth.session.rotate` (info) — token rotation
- `audit:auth.session.revoke` (info) — logout-remote
- `audit:auth.password.reset_request` (info)
- `audit:auth.password.reset_success` (warning) — sessionsRevoked
  metadata
- `audit:auth.password.change` (info)
- `audit:auth.invitation.create` (info) — invitedBy + email + role
- `audit:auth.invitation.accept` (info) — userId + invitationId
- Tüm event'lerde PII mask'leme (email, displayName) uygulanır.
- correlation_id her event'te mevcut.
- ip_address mask'li (son oktet `***`); user_agent_hash SHA-256
  hash.

## Dokümantasyon

- Kullanıcı eğitimi: `docs/user-education/AUTH.md` (9 bölüm +
  SSS). Tüm personel rolleri için ortak rehber.
- Sayfa kataloğu: Frontend henüz yok (GOAL-012+).
- API kataloğu: `docs/api/API_CATALOG.md` (`/auth` + `/me` bölümleri)
  - 3 yeni endpoint doc sayfası.
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` — User (17 alan),
  UserSession (10 alan), UserInvitation (10 alan),
  PasswordResetToken (6 alan).
- Hata kataloğu: VET-AUTH-0001..0008 detaylı tanımlar.
- AI bilgi havuzu: 17 yeni chunk (glossary, audit, error, api, pii).
- docs:check: 0 hata, 3 uyarı (legacy hata kodları pre-existing,
  semver uyarısı pre-existing).
- i18n:check: ✓ tr-TR / en-GB parity temiz.

## Bilinen riskler

- **OneDrive junction sorunu:** Local OneDrive + pnpm izole
  node-linker'ı junction hatalarına yol açıyor. CI'da (Linux)
  çalışır. WORKAROUND: type-check ve test'ler workspace root
  üzerinden global araçlarla çalıştırıldı.
- **RLS integration test eksik:** Service-level cross-tenant testi
  var ama gerçek DB'de (Postgres) RLS davranışı CI'da
  doğrulanmalı (GOAL-100+).
- **Auth interceptor geçişi:** `ActorInterceptor` session varsa
  header'ı override eder; test/dev ortamında hâlâ header fallback
  mümkün. GOAL-012 ile global guard'a geçilecek.
- **Davet e-posta gönderimi:** `inviteUser` invitationUrl üretir
  ve log'a yazar; gerçek e-posta gönderimi GOAL-015 notification
  entegrasyonu.
- **SUPERADMIN auth:** `resolveActorContext` üyelik yoksa STAFF
  döner. SUPERADMIN user'lar için `User.isSuperadmin` alanı
  GOAL-012 ile eklenecek; şu an ilk aktif üyelik döner.
- **bcryptjs (pure-JS):** Native bcrypt yerine pure-JS implementasyon
  kullanıldı (Windows + OneDrive uyumu). Üretim hızı 2-3x yavaş
  olabilir; `BCRYPT_COST=12` korundu. Gerekirse `bcrypt` native
  paketi GOAL-012 ile değerlendirilebilir.
- **In-memory brute-force:** Cluster ortamında Redis'e taşınmalı
  (GOAL-100+). Şu an single-process için yeterli.

## Teknik borç

- `User.status` `User.suspended` ve `User.disabled` ayrımı şu an
  sadece login'de kontrol ediliyor; `getMe` içinde kontrolü
  GOAL-012'de.
- `resolveActorContext` her istekte DB'ye gider (üyelik sorgusu);
  Redis cache ile hızlandırılabilir.
- `acceptInvitation` flow'da email zaten kayıtlıysa parola sıfırlama
  ile birleştiriliyor; UX gereği yeni davet davetliye "parolanı
  güncelle" şeklinde gösterilmeli.
- `passwordHash` döndürülmemesi için `AuthRepository.findUserBy*`
  fonksiyonları şu an full user objesi dönüyor; production'da
  projection ile sadece gerekli alanlar çekilebilir.

## Sonraki goal için notlar

- **GOAL-012 (RBAC):** `User.isSuperadmin` boolean eklenecek;
  `@RequirePermission()` dekoratörü + `PermissionsGuard` ile
  declarative yetki kontrolü. Permission kataloğundaki
  `auth:user:invite`, `auth:user:read` vb. eklenecek.
- **GOAL-013 (feature flag):** Tenant `packageType` (starter/pro/
  enterprise) feature flag ile korunabilir.
- **GOAL-014 (dosya):** Kullanıcı profil fotoğrafı için upload.
- **GOAL-015 (bildirim):** Davet + parola sıfırlama e-posta
  gönderimi bu goal'da stub; notification modülü ile entegre
  olacak.
- **GOAL-016 (superadmin tenant):** SUPERADMIN paneli için tenant
  yönetim arayüzü (mevcut backend API ile).
- **GOAL-020+ (klinik domain):** Hasta sahibi + hayvan kayıtları
  bu auth altyapısı üzerine kurulacak; `actor` context zaten
  hazır.

## Doğrulama özeti

- `pnpm type-check` (apps/api): ✓ 0 hata
- `pnpm test` (apps/api): ✓ 121 passed, 2 skipped
- `pnpm docs:check`: ✓ 0 hata, 3 uyarı (pre-existing)
- `pnpm i18n:check`: ✓ tr-TR/en-GB parity temiz
- Prisma generate: ✓ @prisma/client üretildi
- (ESLint config eksik — pre-existing, GOAL-010'dan beri)
