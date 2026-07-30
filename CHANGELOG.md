# Sürüm Notu (Changelog)

Tüm önemli değişiklikler bu dosyada belgelenir. Format
[Keep a Changelog](https://keepachangelog.com/) standardına uygundur.

## [Unreleased] — GOAL-012 (FAZ-1)

### Eklenen

- **RBAC ve izin motoru (FAZ-1 platform çekirdeği):**
  - `apps/api/prisma/schema.prisma` — `User.isSuperadmin` (boolean,
    default false), `UserSession.activeBranchId` (UUID, FK →
    branches.id, ON DELETE SET NULL) + ilgili index'ler.
  - `apps/api/prisma/migrations/20260101000030_rbac_superadmin_and_active_branch/`
    — Manuel migration SQL.
  - `apps/api/src/common/rbac/` — RBAC altyapısı:
    - `permission.types.ts` — `PermissionDefinition`, `PermissionDecision`,
      `PermissionEvaluationContext`.
    - `permission-catalog.loader.ts` — YAML katalog yükleyici
      (143 permission, basit YAML parser, modül-level cache).
    - `rbac.service.ts` — RBAC motoru (SUPERADMIN bypass, system
      actor kontrolü, rol eşleşmesi, tenant_scope, branch_scope,
      self_only; `audit:rbac.permission_granted` +
      `audit:rbac.permission_denied` event'leri).
    - `permissions.guard.ts` — `@RequirePermission` metadata'sını
      okur, `RbacService` ile değerlendirir; VET-AUTHZ-0001/0003/0004
      hata kodları ile 403.
    - `require-permission.decorator.ts` — `@RequirePermission()` decorator.
    - `rbac.module.ts` — `@Global()` DI kabı.
    - `index.ts` — barrel export.
  - `apps/api/src/common/auth/auth.service.ts` — `resolveActorContext`
    `isSuperadmin` döner; `validateSession` `activeBranchId` döner +
    user inactive revoke; `login` tenant bağlamı zorunluluğu; `me`
    branchId; `setActiveBranch` (yeni metot).
  - `apps/api/src/common/auth/auth.guard.ts` — `isSuperadmin` +
    `branchId` resolve; SUPERADMIN `X-Branch-Id` header override.
  - `apps/api/src/common/auth/auth.controller.ts` — Yeni endpoint:
    `POST /api/v1/auth/switch-branch/:branchId`.
  - `apps/api/src/common/actor/actor-context.service.ts` —
    `ActorContext.isSuperadmin: boolean` eklendi.
  - `apps/api/src/modules/branch/branch.controller.ts` +
    `tenant.controller.ts` — `@UseGuards(PermissionsGuard)` +
    `@RequirePermission(...)` ile declarative yetki kontrolü.
  - `apps/api/src/modules/rbac/rbac-roles.spec.ts` — 5 rol ×
    pozitif/negatif e2e testleri (DB gerektirir; `RUN_RBAC_E2E=1`
    ile çalışır).

### Doküman güncellemeleri

- `docs/permissions/PERMISSION_CATALOG.yaml` — Format spec.
- `docs/permissions/PERMISSION_MATRIX.md` — RBAC bölümü +
  `rbac:permissions:read` + `rbac:roles:read` satırları.
- `docs/fields/FIELD_GLOSSARY.md` — `User.isSuperadmin` +
  `UserSession.activeBranchId` alanları.
- `docs/errors/ERROR_CATALOG.md` — `VET-AUTHZ-0006` (Tenant
  bağlamı zorunlu) eklendi.
- `docs/errors/AUDIT_EVENTS.yaml` — `audit:auth.branch.switch`,
  `audit:rbac.permission_granted`, `audit:rbac.permission_denied`.
- `docs/api/API_CATALOG.md` + `docs/api/api.post._auth_switch-branch__id.md`
  — Branch switch endpoint dokümanı.
- `docs/user-education/RBAC.md` — Yeni Türkçe kullanıcı rehberi.
- `docs/ai/AI_CHUNKS.yaml` — 8 yeni chunk (rbac-engine, require-permission,
  permission-denied, superadmin, branch-scope, audit-granted,
  audit-denied, api-switch-branch).
- `packages/i18n/src/locales/tr-TR.json` + `en-GB.json` —
  VET-AUTHZ-0006 çevirileri.

### Doğrulama

- `pnpm type-check` (apps/api): ✓ 0 hata
- `pnpm test` (apps/api): ✓ 151 passed, 8 skipped (159 toplam)
- `pnpm docs:check`: ✓ 0 hata, 6 uyarı (4 pre-existing + 2 test
  amaçlı katalog dışı permission)
- `pnpm i18n:check`: ✓ tr-TR / en-GB parity temiz

## [Unreleased] — GOAL-011 (FAZ-1)

### Eklenen

- **Personel paneli kimlik doğrulama ve oturum yönetimi (FAZ-1 platform çekirdeği):**
  - `apps/api/prisma/schema.prisma` — `User`, `UserSession`,
    `UserInvitation`, `PasswordResetToken` modelleri; `user_status`,
    `invitation_status` enum'ları; `UserTenantMembership.userId` FK
    bağlantısı.
  - `apps/api/prisma/migrations/20260101000020_init_auth_users_sessions/`
    — Manuel migration SQL (tablolar, index'ler, RLS self/tenant
    policy'leri, FK bağlantıları).
  - `apps/api/src/common/auth/` — Kimlik doğrulama modülü:
    - `auth.service.ts` — login, logout, refresh, forgotPassword,
      resetPassword, changePassword, inviteUser, acceptInvitation,
      switchTenant, me, listSessions, revokeSessionById,
      validateSession, resolveActorContext.
    - `auth.controller.ts` — 9 public + auth korumalı endpoint
      (`/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/forgot`,
      `/auth/reset`, `/auth/change-password`, `/auth/invitations`,
      `/auth/invitations/accept`, `/auth/switch-tenant`).
    - `auth.guard.ts` — Session doğrulama + ActorContext üretimi
      (cookie + Authorization Bearer). `@Public()` dekoratörü ile
      public endpoint işaretleme.
    - `auth.repository.ts` — Users, sessions, invitations, reset
      token'ları için DB erişim katmanı.
    - `brute-force.ts` — In-memory sayaç (5 deneme / 15 dakika
      kilit); DB `User.failedLoginCount + lockedUntil` ile senkron.
    - `password.ts` — bcryptjs cost 12 hash + verify.
    - `token.ts` — 32 byte secure random (hex) + SHA-256 hash.
    - `dto.ts` — IP mask + UA hash + correlation ID çıkarımı.
  - `apps/api/src/modules/identity/` — IdentityController: `/me`,
    `/me/sessions`, `/me/sessions/:id` (DELETE).
  - `apps/api/src/app.module.ts` — AuthModule + IdentityModule
    bağlandı.
  - `packages/contracts/src/auth.ts` — Login/Logout/Refresh/Forgot/
    Reset/ChangePassword/Invite/AcceptInvitation/Me/SessionList/
    SwitchTenant Zod şemaları + actor role + password policy.
  - `apps/api/src/common/auth/auth.service.spec.ts` — 31 unit test
    (login, logout, refresh, forgot/reset, change, invitation, accept).
  - `apps/api/src/common/auth/brute-force.spec.ts` — 5 unit test
    (sayaç, lockout, GC).
  - `apps/api/src/common/actor/actor-context.service.ts` — GOAL-010
    placeholder header fallback'i korundu; AuthGuard session varsa
    override eder.

- **Güvenlik özellikleri:**
  - bcryptjs cost 12 parola hash; plain parola asla loglanmaz.
  - SHA-256 hash'lenmiş opaque token (DB'de plain yok).
  - HttpOnly + SameSite=Lax cookie; secure flag prod'da aktif.
  - 30 gün TTL + 24 saat idle timeout; sliding session refresh.
  - Token rotation: yeni session insert + eski `replacedById`.
  - Parola sıfırlama → tüm oturumlar iptal.
  - Brute-force: 5 başarısız deneme → 15 dakika hesap kilidi.
  - Email enumeration koruması: genel hata mesajı, decoy bcrypt
    timing eşitleme.
  - Tüm auth event'leri `audit:auth.*` audit log'a yazılır (PII
    mask'li).

- **Dokümantasyon:**
  - `docs/api/API_CATALOG.md` — Auth + Identity bölümleri (login,
    logout, refresh, forgot, reset, change-password, invitations,
    accept, switch-tenant, me, sessions).
  - `docs/api/api.auth.*.md`, `api.me.*.md` — Her endpoint için
    ayrı dosya.
  - `docs/fields/FIELD_GLOSSARY.md` — User, UserSession,
    UserInvitation, PasswordResetToken alan sözlükleri.
  - `docs/user-education/AUTH.md` — Personel paneli kimlik
    doğrulama rehberi (10 bölüm: ilk giriş, günlük giriş, parola
    sıfırlama, parola değiştirme, davet, çıkış, oturum yönetimi,
    hesap kilidi, SSS, ilgili dokümanlar).
  - `docs/user-education/INDEX.md` — GOAL-010 ve GOAL-011 zaman
    çizelgesi eklendi.
  - `docs/errors/ERROR_CATALOG.md` — 8 yeni hata kodu eklendi
    (VET-AUTH-0001-0008).
  - `docs/permissions/PERMISSION_CATALOG.yaml` — 5 yeni auth
    permission (`auth:session:read`, `auth:session:revoke`,
    `auth:password:change`, `auth:invitation:create`,
    `auth:invitation:read`). Toplam 113 → 118.
  - `docs/permissions/PERMISSION_MATRIX.md` — Auth bölümü tablosu.
  - `docs/ai/AI_CHUNKS.yaml` — 12 yeni chunk (VET-AUTH-0002-0008
    error chunk'ları + flow-login + flow-password-reset +
    flow-invitation + glossary-user + glossary-user-session +
    glossary-user-invitation).

- **i18n parity (tr-TR + en-GB):**
  - 8 yeni hata kodu çevirisi (VET-AUTH-0001-0008) her iki dilde
    eklendi.

- **Testler:**
  - 2 yeni spec dosyası (auth.service, brute-force).
  - 36 yeni unit test; hepsi geçti.
  - Toplam: 144 unit test + 2 skip; hepsi geçti.

- **Refactor:**
  - `auth.guard.ts` — `source: "header"` → `"session"` (kimlik
    doğrulandı; üst başlık fallback'i yerine gerçek session).
  - `auth.guard.ts` — `resolveRoleAndTenant` ölü `memberships`
    değişkeni temizlendi.
  - `auth.service.ts` — `auditAuthEvent` helper'ı ile
    login/logout/refresh/forgot/reset/change/invite/accept tüm
    akışlar tutarlı audit event yayınlar.

- **Bilinen kısıtlamalar:**
  - Davet email gönderimi şu an stub; GOAL-015 (bildirim altyapısı)
    ile birlikte SMTP/email provider entegrasyonu eklenecek.
  - Şifre süresi dolma (VET-AUTH-0006) henüz politika tabanlı
    değil; GOAL-012+ ile birlikte aktifleştirilecek.
  - MFA / 2FA pilot kapsamında değil; Faz 12 güvenlik testleri
    sonrası değerlendirilecek.
  - Süperadmin user için `is_superadmin` boolean henüz yok; ilk
    kurulumda "hiç üyeliği olmayan user = SUPERADMIN" yaklaşımı
    kullanılıyor (prod'da `users.is_superadmin` eklenmesi planlanıyor).

## [Unreleased] — GOAL-010 (FAZ-1)

### Eklenen

- **Tenant ve şube altyapısı (FAZ-1 platform çekirdeği):**
  - `apps/api/prisma/schema.prisma` — Tenant, Branch,
    UserTenantMembership, AuditEvent modelleri; enum'lar;
    append-only trigger; RLS policy'ler.
  - `apps/api/prisma/migrations/20260101000010_init_tenant_branch_audit/`
    — Manuel migration SQL (tablolar, index'ler, trigger'lar, RLS).
  - `apps/api/src/common/actor/` — ActorContextService (auth placeholder),
    ActorInterceptor (global), CurrentActor dekoratörü.
  - `apps/api/src/common/audit/audit.service.ts` — Prisma entegrasyonu
    (best-effort DB yazımı + log).
  - `apps/api/src/modules/tenant/` — TenantModule: Controller +
    Service + Repository + DTO + unit test (9 test).
  - `apps/api/src/modules/branch/` — BranchModule: Controller +
    Service + Repository + DTO + unit test (8 test).
  - `packages/contracts/src/tenant.ts` — Tenant Zod şemaları
    (Create/Update/Close/Response/List).
  - `packages/contracts/src/branch.ts` — Branch Zod şemaları.
  - `packages/contracts/src/index.ts` — Yeni modüller export edildi.
  - `apps/api/src/main.ts` — ActorInterceptor global bağlandı,
    Swagger'da yeni header'lar.

- **Dokümantasyon:**
  - `docs/api/API_CATALOG.md` — Tenant + branch API kataloğu.
  - `docs/api/api.*.md` — Her endpoint için ayrı dosya (10 endpoint).
  - `docs/fields/FIELD_GLOSSARY.md` — Tenant + branch alan sözlüğü.
  - `docs/user-education/SUPERADMIN.md` — Tenant onboarding rehberi.
  - `docs/ai/AI_CHUNKS.yaml` — 14 yeni chunk (tenant, branch, RLS,
    security, audit event'leri, permission'lar, yeni hata kodları).
  - `docs/errors/ERROR_CATALOG.md` — 5 yeni kod eklendi
    (VET-TENANT-0004/0005, VET-BRANCH-0003/0004, VET-AUTHZ-0005).
  - `docs/user-education/INDEX.md` — GOAL-010 zaman çizelgesi eklendi.

- **i18n parity (tr-TR + en-GB):**
  - 5 yeni hata kodu çevirisi her iki dilde eklendi.

- **Testler:**
  - 4 yeni spec dosyası (audit, actor-context, tenant, branch).
  - Toplam: 85 unit test + 2 skip; hepsi geçti.

- **tools/docs-check güncellemeleri:**
  - AI_CHUNKS.yaml mixed format desteği (`loadAll` + parçalı parse).
  - `security` chunk type eklendi.
  - API docKey'de `:` karakteri sanitize edildi (Windows uyumu).

### Değişen

- `apps/api/src/common/audit/audit.module.ts` — AuditService'e
  PrismaService inject edildi.
- `apps/api/src/app.module.ts` — TenantModule, BranchModule,
  ActorModule eklendi.
- `apps/api/src/main.ts` — ActorInterceptor + Swagger header
  tanımları eklendi.

### Bilinen kısıtlamalar

- **Auth placeholder:** GOAL-011'e kadar actor bilgisi
  `X-Actor-Id`, `X-Actor-Role`, `X-Tenant-Id` header'larından
  okunur. Production'da header yoksa 401 döner. Bu GOAL-011
  ile gerçek JWT/session tabanlı auth ile değiştirilecek.
- **Prisma generate:** OneDrive junction sorunu nedeniyle global
  `prisma@5.22.0` ile generate edildi. Repo'da symlink/junction
  düzeltilirse `pnpm db:generate` çalışır.
- **e2e test:** Postgres bağlantısı olmadığından `app.e2e-spec.ts`
  atlandı. CI'da postgres servisi ile çalışır.

## [Unreleased] — GOAL-000

### Eklenen

- pnpm + Turborepo monorepo iskeleti
- `apps/api` (NestJS 10) iskeleti: sağlık endpoint'leri, OpenAPI, Prisma
- `apps/web` (Next.js 14) iskeleti: i18n routing, sağlık sayfası
- `apps/worker` (BullMQ) iskeleti: örnek health job
- `packages/contracts` (Zod şemaları): health, error, locale
- `packages/i18n` (i18next): tr-TR + en-GB kaynakları
- `packages/ui` (Tailwind + shadcn benzeri primitives): Button, Card, Input
- `packages/config`: ortak tsconfig / eslint / prettier / tailwind presetleri
- `tools/docs-check`: doküman-kod uyum denetleyicisi (route, error code, permission)
- `tools/i18n-check`: i18n anahtar parity denetleyicisi
- Docker Compose: postgres 15, redis 7, mailhog
- GitHub Actions CI: install, lint, type-check, test, build, docs-check, e2e smoke
- Türkçe dosya açıklama standardı
- Hata kataloğu, yetki matrisi, alan sözlüğü, AI bilgi havuzu iskeleti

### Kapsam dışı (Faz 1+)

- Tenant ve şube yönetimi (GOAL-001)
- Oturum ve yetkilendirme (GOAL-001)
- Tenant izolasyonu RLS (GOAL-001)
- Gerçek audit log (GOAL-001)
- Hasta sahibi ve hayvan (GOAL-002)
- Aşı kaydı ve stok düşümü (GOAL-003)
- Sentry/Otel (Faz 10)
- e-SMM, ödeme, SMS (Faz 13+)
