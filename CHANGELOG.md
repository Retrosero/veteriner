# Sürüm Notu (Changelog)

Tüm önemli değişiklikler bu dosyada belgelenir. Format
[Keep a Changelog](https://keepachangelog.com/) standardına uygundur.

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
