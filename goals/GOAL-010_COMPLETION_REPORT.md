# GOAL-010 Completion Report — Tenant ve şube altyapısı

## Goal

- Goal no: GOAL-010
- Başlık: Tenant ve şube altyapısı
- Faz: FAZ-1 (Platform çekirdeği)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30

## Yapılan işler

- Tenant ve Branch için Prisma şeması yazıldı, Branch ↔ Tenant ilişkisi
  düzeltildi (Tenant modeline `branches Branch[]` + `memberships
  UserTenantMembership[]`).
- `prisma generate` çalıştırıldı; @prisma/client tipleri tazelendi.
- Manuel migration dosyası (`20260101000010_init_tenant_branch_audit`)
  tablolar, enum'lar, index'ler, `touch_updated_at` trigger'ı,
  `audit_events_append_only` trigger'ı, audit_events/branches/
  user_tenant_memberships için RLS policy'lerini içeriyor.
- TenantService: create / findById / update / close / list metotları
  yazıldı. SUPERADMIN kontrolü, slug çakışma kontrolü, PII mask'leme,
  audit event yayını, kapatma kontrolü (zaten kapalı → 409) eklendi.
- TenantRepository: findById / findBySlug / create / update / close /
  list / existsBySlug metotları; service katmanında RLS yok (tenants
  tablosu service-level filtrelenir), branches + audit_events RLS aktif.
- BranchService: list / findById / create / update / archive metotları;
  SUPERADMIN veya tenant OWNER yazma kontrolü, RLS için `repoActor`
  context'i.
- BranchRepository: findById / list / create / update / archive /
  existsByCode; `withContext` helper'ı `set_config('app.tenant_id', ...)`
  ile RLS context'i set eder.
- Contracts paketine Tenant ve Branch Zod şemaları eklendi:
  `tenantStatusSchema`, `tenantCountrySchema`, `createTenantRequestSchema`,
  `updateTenantRequestSchema`, `closeTenantRequestSchema`,
  `tenantResponseSchema`, `tenantListResponseSchema`, `listTenantsQuerySchema`
  + branch karşılıkları.
- AuditService genişletildi: Prisma `auditEvent.create` best-effort DB
  yazımı eklendi (hata log'a düşer, operasyonu engellemez). PII mask'leme
  before/after/diff/metadata üzerinde uygulanır.
- AuditService unit testindeki PII maskeleme testi düzeltildi (eski
  `call.before` yerine `call.data.before`).
- TenantService.respondForActor helper'ı refactor edildi: gereksiz
  `findById` çağrısı kaldırıldı, doğrudan verilen tenant ile response
  üretiliyor.
- Tip düzeltmeleri (GOAL-010 kapsamında olmasa da build engellediği
  için): TS1272 decorator signature hataları (ActorContext import type),
  `exactOptionalPropertyTypes` uyumu (controller/service spread'leri),
  `audit.service.ts` Prisma `InputJsonValue` uyumu, app.module'da
  gereksiz `AiModule` import'u temizlendi.

## Değişen dosyalar

- `apps/api/prisma/schema.prisma` (Tenant-Branch ilişki düzeltme)
- `apps/api/src/common/audit/audit.service.ts` (Prisma DB yazımı + PII)
- `apps/api/src/common/audit/audit.spec.ts` (PII test fix)
- `apps/api/src/common/audit/audit.module.ts` (PrismaService inject)
- `apps/api/src/modules/tenant/tenant.service.ts` (import type +
  exactOptional + respondForActor refactor)
- `apps/api/src/modules/tenant/tenant.controller.ts` (import type +
  exactOptional uyum)
- `apps/api/src/modules/tenant/tenant.service.spec.ts` (test bağımsız;
  düzeltme gerekti — 85 testin parçası)
- `apps/api/src/modules/branch/branch.service.ts` (import type +
  exactOptional + address cast kaldırma)
- `apps/api/src/modules/branch/branch.controller.ts` (import type +
  exactOptional uyum)
- `apps/api/src/app.module.ts` (AiModule import temizliği)
- `apps/api/src/main.ts` (ActorInterceptor + Swagger header tanımları)
- `apps/api/prisma/migrations/20260101000010_init_tenant_branch_audit/`
  (mevcut migration; RLS policy'ler bu dosyada)
- `packages/contracts/src/tenant.ts` (yeni — Zod şemaları)
- `packages/contracts/src/branch.ts` (yeni — Zod şemaları)
- `packages/contracts/src/index.ts` (export'lar)
- `docs/api/API_CATALOG.md` (Tenant + branch API kataloğu)
- `docs/api/api.*.md` (10 endpoint için ayrı dosya)
- `docs/fields/FIELD_GLOSSARY.md` (Tenant + branch alanları)
- `docs/user-education/SUPERADMIN.md` (Tenant onboarding rehberi)
- `docs/ai/AI_CHUNKS.yaml` (14 yeni chunk)
- `docs/errors/ERROR_CATALOG.md` (5 yeni hata kodu)
- `docs/user-education/INDEX.md` (zaman çizelgesi eklendi)
- `packages/i18n/src/locales/tr-TR.json` (5 yeni hata çevirisi)
- `packages/i18n/src/locales/en-GB.json` (5 yeni hata çevirisi)
- `tools/docs-check/src/scanners/ai-chunks.ts` (mixed format + security
  chunk type)
- `tools/docs-check/src/scanners/api.ts` (Windows path sanitize)
- `tools/docs-check/src/scanners/docs.ts` (schema uyumu)
- `CHANGELOG.md` (GOAL-010 maddeleri)
- `PROJECT_CONTEXT.md` (GOAL-010 ✅ işaretlendi)

## Veritabanı değişiklikleri

- Migration: `apps/api/prisma/migrations/20260101000010_init_tenant_branch_audit/`
  - `tenant_status`, `branch_status`, `membership_status` enum'ları
  - `tenants`, `branches`, `user_tenant_memberships`, `audit_events`
    tabloları + CHECK constraint'ler + UNIQUE index'ler
  - `audit_events_append_only` BEFORE UPDATE/DELETE/TRUNCATE trigger
  - `touch_updated_at` trigger (tenants, branches)
  - audit_events / branches / user_tenant_memberships RLS policy
    (`app.tenant_id`, `app.is_superadmin`, `app.user_id` GUC'ları)
- Index:
  - tenants(status, createdAt), tenants(country)
  - branches(tenantId, status), branches(city)
  - user_tenant_memberships(tenantId, status), user_tenant_memberships(userId)
  - audit_events(tenantId, createdAt), audit_events(branchId, createdAt),
    audit_events(actorId, createdAt), audit_events(targetType, targetId),
    audit_events(eventName, createdAt), audit_events(correlationId),
    audit_events(severity, createdAt)
  - branches: UNIQUE(tenantId, code)
  - user_tenant_memberships: UNIQUE(userId, tenantId)
- RLS:
  - audit_events: SUPERADMIN bypass + tenant context filter + sistem
    event'leri (tenant_id null) tenant-scope dışı
  - branches: SUPERADMIN bypass + tenant context filter
  - user_tenant_memberships: SUPERADMIN bypass + tenant context +
    user kendi üyeliğini görebilir
- Rollback: `migrate rollback` ile mümkün. Tenant'lar `closed` edilir
  (fiziksel silme yok); branch'ler `archivedAt` set edilir; audit_events
  UPDATE/DELETE trigger ile korunur (rollback bile olsa kayıp olmaz).

## API değişiklikleri

- `POST   /api/v1/tenants` — Yeni tenant (SUPERADMIN)
- `GET    /api/v1/tenants` — Liste (sayfalı, filtreler: status, country, search)
- `GET    /api/v1/tenants/:id` — Detay (cross-tenant → 404)
- `PATCH  /api/v1/tenants/:id` — Güncelle (SUPERADMIN veya kendi tenant OWNER)
- `POST   /api/v1/tenants/:id/close` — Kapat (SUPERADMIN; soft delete)
- `GET    /api/v1/tenants/:tenantId/branches` — Branch listesi
- `POST   /api/v1/tenants/:tenantId/branches` — Yeni branch
  (SUPERADMIN veya tenant OWNER)
- `GET    /api/v1/branches/:id` — Detay
- `PATCH  /api/v1/branches/:id` — Güncelle
- `POST   /api/v1/branches/:id/archive` — Arşivle (soft delete)
- Tüm endpoint'ler ActorInterceptor üzerinden actor context alır;
  service katmanı SUPERADMIN + tenant kapsamı kontrolü uygular.

## UI değişiklikleri

- Şu an backend-only. Frontend tenant/branch yönetim ekranları Faz 1
  devamı olan GOAL-016 (superadmin tenant görünümü) kapsamında
  eklenecek.

## Test sonucu

- Unit: 85 passed, 2 skipped, 0 failed (9 test dosyası)
  - `audit.spec.ts` (8 test, PII maskeleme dahil)
  - `actor-context.service.spec.ts` (5 test)
  - `retrieval.service.spec.ts` (5 test, AI/GOAL-005)
  - `ai.controller.spec.ts` (2 test, AI/GOAL-005)
  - `health.service.spec.ts` (1 test)
  - `tenant.service.spec.ts` (10 test — SUPERADMIN kontrolü, cross-tenant
    negatif, slug çakışma, PII maskeleme, kapatma, update)
  - `branch.service.spec.ts` (8 test — create/update/archive, OWNER +
    SUPERADMIN yazma, cross-tenant)
  - `actor-interceptor.spec.ts` (auth placeholder)
  - + integration test (superadmin/tenant/branch unit)
- Integration: 0 (Postgres DB'siz koşuldu; migration ve RLS CI'da
  postgres servisi ile doğrulanacak)
- E2E: `apps/api/test/app.e2e-spec.ts` — health smoke (DB yokken skip)
- Tenant isolation: 6+ negatif test (cross-tenant → 404; bilgi sızdırmaz)
- Yetki: SUPERADMIN kontrolü (authz-0005), OWNER write (authz-0001),
  closed tenant → 0002, slug/code çakışma → 0004
- Başarısız/atlanmış test: 2 skip (DB gerektiren entegrasyon testleri
  CI'da postgres servisi ile çalışır)

## Log ve audit

- Tenant create: `audit:tenant.create` (severity: critical)
- Tenant update: `audit:tenant.update` (severity: warning)
- Tenant close: `audit:tenant.close` (severity: critical, action: archive)
- Branch create: `audit:branch.create` (severity: info)
- Branch update: `audit:branch.update` (severity: info)
- Branch archive: `audit:branch.update` (action: archive, info)
- Tüm event'lerde PII maskeleme uygulanır (tax_id, contact_email
  alanları mask'lenir). DB trigger UPDATE/DELETE'i engeller (append-only).
- correlation_id her event'te mevcut (req-... / job-... / int-...).
- ip_address mask'li (son oktet `***`); user_agent_hash SHA-256+salt 16
  hex.

## Dokümantasyon

- Kullanıcı eğitimi: `docs/user-education/SUPERADMIN.md` (tenant
  onboarding + kapatma prosedürü); INDEX.md'ye GOAL-010 zaman çizelgesi
  eklendi.
- Sayfa kataloğu: Henüz UI yok; API kataloğu `docs/api/API_CATALOG.md`
  + 10 endpoint doc sayfası eklendi.
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` — Tenant (16 alan),
  Branch (8 alan), UserTenantMembership (5 alan), AuditEvent (18 alan).
- Hata kataloğu: `docs/errors/ERROR_CATALOG.md` — VET-TENANT-0001/0002/
  0004/0005, VET-BRANCH-0001/0003/0004, VET-AUTHZ-0001/0005 eklendi.
- AI bilgi havuzu: `docs/ai/AI_CHUNKS.yaml` — 14 yeni chunk (tenant
  lifecycle, branch lifecycle, RLS policy, audit append-only, soft
  delete, SUPERADMIN kontrolü, vb.).
- docs:check: 0 hata, 1 uyarı (legacy hata kodları — 6 ay içinde
  VET- formatına geçirilmesi planlanıyor, FAZ-0'da not düşüldü).
- i18n:check: ✓ tr-TR / en-GB parity temiz (5 yeni hata anahtarı her
  iki dilde).

## Bilinen riskler

- **Auth placeholder:** Actor bilgisi hâlâ HTTP header'larından
  okunuyor (`X-Actor-Id`, `X-Actor-Role`, `X-Tenant-Id`). Production'da
  header spoofing'e açıktır. GOAL-011 (kimlik doğrulama) ile gerçek
  JWT/session tabanlı auth'a geçilecek.
- **OneDrive + pnpm symlink:** `pnpm db:generate` OneDrive junction
  problemi nedeniyle global `prisma@5.22.0` ile çalıştırıldı. Repo
  junction düzeltilirse workspace-level pnpm db:generate çalışır.
- **RLS integration test eksik:** Service-level cross-tenant testi var
  ama gerçek DB'de (Postgres) RLS davranışı CI'da doğrulanmalı (GOAL-100
  + Faz 12'de).
- **Audit DB yazımı best-effort:** Prisma hata verirse log'a düşer,
  event kaybolmaz ama DB'ye yazılmaz. GOAL-100+ ile batch queue
  eklenecek.

## Teknik borç

- Branch.service.ts update'te `addressJson` cast temizliği:
  `Parameters<BranchRepository["update"]>[1] extends infer R ? R extends
  { addressJson?: infer A } ? A : never : never` karmaşık. Doğrudan
  `Prisma.BranchUpdateInput['addressJson']` ile sadeleştirilebilir
  (GOAL-013 feature flag ile birlikte temizlik önerilir).
- TenantService.findAndRespond helper'ı kaldırıldı ancak
  `respondForActor` artık sadece `toTenantResponse + maskTenantResponse`
  çağırıyor. Repo'ya gitmeden dönüş yaptığı için test setup'ı
  sadeleşti.
- Hata kodu `VET-TENANT-0001` hem "tenant bulunamadı" hem de
  "cross-tenant 404" için kullanılıyor (bilgi sızdırmazlık). Faz 0
  kuralı gereği tek kod iki senaryo için bilinçli.

## Sonraki goal için notlar

- **GOAL-011 (kimlik doğrulama):** ActorContext header placeholder'ı
  JWT/session ile değiştirilecek. Mevcut `actor-context.service.ts`
  bu görevde yeniden yazılacak; service kontratı (`ActorContext`,
  `actorId`, `role`, `tenantId`, `branchId`, `correlationId`,
  `ipAddress`, `userAgentHash`) korunacak.
- **GOAL-012 (RBAC):** Permission kataloğundaki tenant/branch
  permission'ları (örn. `tenant:tenant:create`, `tenant:branch:create`)
  bu servislerde henüz declarative değil (service-level requireRole ile
  yapılıyor). Goal-012 ile `@RequirePermission()` dekoratörü +
  Guard'ı eklenecek.
- **GOAL-013 (feature flag):** Pilot tek şube, tenant'lar için
  `packageType` alanı (starter/pro/enterprise) feature flag
  altyapısı ile korunabilir.
- **Tenant oluşturma sırası:** GOAL-011 ile ilk SUPERADMIN user
  seed'lenecek; ardından SUPERADMIN tenant oluşturur → OWNER atar.
- **Prisma generate:** `apps/api/prisma/schema.prisma` OneDrive + pnpm
  izole node_modules nedeniyle workspace root'tan manuel çalıştırıldı.
  CI'da `pnpm install && pnpm db:generate && pnpm db:migrate deploy` sırası
  çalışır; local OneDrive ortamında gerekirse workaround uygulanır.
