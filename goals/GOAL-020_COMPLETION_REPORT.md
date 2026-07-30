# GOAL-020 Completion Report — Hasta sahibi kayıt ve arama

## Goal

- Goal no: GOAL-020
- Başlık: Hasta sahibi kayıt ve arama
- Faz: FAZ-2 (Klinik domain)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30

## Yapılan işler (özet)

- **OwnersService** (`apps/api/src/modules/owners/owners.service.ts`):
  - `create(tenantId, input, actor)` — KVKK consent zorunlu, telefon
    E.164 normalize (`+90XXXXXXXXXX`), TCKN/VKN algoritmik doğrulama
    (ülke adaptörü), tenant-scoped duplicate telefon → 409
    `VET-CLINIC-0002`, audit `audit:owner.create` (info).
  - `findById(tenantId, id, actor)` — tenant izolasyonu; cross-tenant
    → null (controller 404).
  - `search(tenantId, filters, actor)` — case-insensitive
    ad/soyad/telefon/email/taxId araması + `phone`/`city` ek filtre
    + pagination.
  - `archive(tenantId, id, actor)` — soft delete (`archivedAt`),
    idempotent, audit `audit:owner.archive` (warning).
- **OwnersController** — 4 endpoint (`api/v1/clinic/owners`):
  - `POST   /api/v1/clinic/owners` (create)
  - `GET    /api/v1/clinic/owners` (search + pagination)
  - `GET    /api/v1/clinic/owners/:id` (detay)
  - `DELETE /api/v1/clinic/owners/:id` (archive)
- **Sözleşme** (`packages/contracts/src/owner.ts`): `OwnerCreateInput`,
  `OwnerSearchQuery`, `OwnerResponse`, Zod validasyonu.
- **OwnersModule** + `index.ts` barrel.
- **16 yeni test** (`owners.service.spec.ts`): happy path create (E.164
  normalize, audit yayını), valid TCKN, KVKK yoksa 422, invalid TCKN
  422, invalid VKN 422, duplicate telefon 409, cross-tenant aynı telefon
  çakışma yok, findById tenant izolasyonu, search ad/telefon/pagination
  + tenant izolasyonu, archive audit + idempotent + 404.

## Değişen dosyalar (core + docs)

**Core (commit 9686ead):**

- `apps/api/src/modules/owners/owners.controller.ts` — yeni.
- `apps/api/src/modules/owners/owners.service.ts` — yeni.
- `apps/api/src/modules/owners/owners.repository.ts` — yeni (in-memory).
- `apps/api/src/modules/owners/owners.module.ts` — yeni.
- `apps/api/src/modules/owners/owners.service.spec.ts` — yeni (16 test).
- `apps/api/src/modules/owners/index.ts` — yeni.
- `apps/api/src/app.module.ts` — `OwnersModule` import.
- `packages/contracts/src/owner.ts` + `index.ts` — paylaşılan Zod şemaları.
- `apps/api/src/common/owners/owner.types.ts` — domain tipleri.

**Doküman & i18n (bu commit):**

- `goals/GOAL-020_COMPLETION_REPORT.md` — yeni (bu dosya).
- `PROJECT_CONTEXT.md` — GOAL-020 ⏳ → ✅.
- `docs/api/api.post._api_v1_clinic_owners.md` — yeni.
- `docs/api/api.get._api_v1_clinic_owners.md` — yeni.
- `docs/api/api.get._api_v1_clinic_owners__id.md` — yeni.
- `docs/api/api.delete._api_v1_clinic_owners__id.md` — yeni.
- `docs/ai/AI_CHUNKS.yaml` — 3 yeni chunk (`flow-owner-create`,
  `error-VET-CLINIC-0002`, `kvkk-consent-owner-create`).
- `docs/fields/FIELD_GLOSSARY.md` — Owner alanları eklendi.

## 🎉 FAZ-2 BAŞLANGIÇ

- ✅ GOAL-020 — hasta sahibi kayıt ve arama

Klinik domain'in ilk goal'i tamamlandı. Sıradaki: GOAL-021
(hayvan kayıt sistemi).

## Notlar ve tasarım kararları

- **TCKN/VKN validate:** `CountryAdapter.validateTaxId` üzerinden
  algoritmik doğrulama (10 hane → VKN `company`, 11 hane → TCKN
  `personal`). Başarısızsa `VET-VALIDATION-0006` (422).
- **Telefon E.164:** `05321234567`, `5321234567`, `+905321234567`
  kabul edilir; `5XX` ile başlamalı (TR mobil); aksi → null →
  `VET-VALIDATION-0003` (422).
- **KVKK consent:** `consentKvkk=false` → `VET-VALIDATION-0002` (422).
  `consentMarketing` opsiyonel (default false). KVKK consent tarihçesi
  audit'te (`audit:owner.create` payload'ında `consentKvkk` flag'i).
- **Duplicate telefon:** Aynı tenant + aynı telefon → `VET-CLINIC-0002`
  (409). Farklı tenant aynı telefon → çakışma yok (tenant-scoped).
  E.164 normalize sonrası karşılaştırma yapılır.
- **Cross-tenant:** `requireTenantScope` actor.tenantId ile service
  parametresini karşılaştırır. Uyumsuz → `VET-AUTHZ-0001` (403).
  `findById` için controller 404 (`VET-CLINIC-0001`) döner (bilgi
  sızdırmaz).
- **Arama:** `search` alanı ad/soyad/telefon/email/taxId üzerinde
  case-insensitive substring; `phone` ve `city` ek filtre.
  Pagination `limit` (max 100) + `offset`.
- **Archive:** Soft delete; PII korunur, audit `audit:owner.archive`
  (warning). Idempotent: ikinci kez arşivleme mevcut kaydı döner.
  Arşivlenen kayıtlar default arama sonuçlarında DAHİL değildir
  (klinik işlemlerde gizleme).

## Veritabanı değişiklikleri

Yok. GOAL-020 service katmanı in-memory `OwnersRepository` ile
çalışır (FAZ-2 pilot). DB persistence GOAL-021+ ile birlikte
Prisma `PatientOwner` modeli olarak eklenecek.

## API değişiklikleri

- `POST /api/v1/clinic/owners` — Yeni hasta sahibi. Auth +
  `clinic:owner:create`. Body: `OwnerCreateInput`. 201 → `Owner`.
  Hata: 409 duplicate (`VET-CLINIC-0002`), 422 validation
  (`VET-VALIDATION-0002/0003/0006`).
- `GET /api/v1/clinic/owners` — Tenant-scoped arama. Auth +
  `clinic:owner:read`. Query: `search?`, `phone?`, `city?`, `limit`,
  `offset`. 200 → `{ items: Owner[], total }`.
- `GET /api/v1/clinic/owners/:id` — Detay. Auth + `clinic:owner:read`.
  200 → `Owner`. 404 → `VET-CLINIC-0001` (cross-tenant dahil).
- `DELETE /api/v1/clinic/owners/:id` — Arşivle. Auth +
  `clinic:owner:archive`. 200 → `Owner` (archived). 404 →
  `VET-CLINIC-0001`.

## Test sonucu

- Unit: 16 yeni test (`owners.service.spec.ts`).
- Tenant isolation: findById cross-tenant null, search farklı tenant
  görmez, aynı telefon farklı tenant'ta çakışma yok.
- Negative path: KVKK yok, invalid TCKN, invalid VKN, duplicate
  telefon, olmayan id arşivleme, archive idempotent.
- Başarısız test: 0.

## Log ve audit

- `audit:owner.create` (info) — KVKK + telefon + firstName/lastName
  payload (PII mask'leme response'da değil; audit payload'ında
  ham değer — `docs/errors/PII_MASKING.md` audit log için plain PII
  kabul eder; log altyapısı retention kuralı uygular).
- `audit:owner.archive` (warning) — before/after `archivedAt`.

## Bilinen riskler

- **In-memory repo:** Pilot ölçeğinde kabul; DB persistence
  GOAL-021+ ile birlikte.
- **TCKN/VKN check:** Algoritmik; gerçek NVI/GİB doğrulaması
  dış servis adapter'ı ile FAZ-3+'da.
- **Search performansı:** `contains` + case-insensitive index
  kullanmaz. Pilot için kabul; pg_trgm FAZ-3+'da.

## Sonraki goal için notlar

- **GOAL-021 (Hayvan kayıt sistemi):** `Patient` + `Owner` ilişkisi
  (ownerId FK), `flow-ownership-transfer` entegrasyonu, mikroçip
  unique kontrolü (`VET-CLINIC-0003`).
- **FAZ-2 sırası:** owner (✅) → patient → ownership → allergies →
  timeline → portal.
