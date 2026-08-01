# GOAL-021 Completion Report — Hayvan kayıt sistemi

- Goal no: GOAL-021
- Başlık: Hayvan (Hasta) kayıt sistemi
- Faz: FAZ-2 (Klinik domain)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 5c5cfca

## Yapılan işler

**PatientsService** (`apps/api/src/modules/patients/`): `create` owner
cross-tenant doğrular (404 `VET-AUTHZ-0002`); tür TR whitelist
(`dog|cat|bird`) dışı → 422 `VET-CLINIC-0004`; mikroçip 15 hane + aynı
tenant'ta unique (duplicate → 409 `VET-CLINIC-0003`); doğum tarihi
gelecekte olamaz → 422 `VET-VALIDATION-0009`. `findById` tenant-scoped
(cross-tenant → null). `search` name/breed/microchip case-insensitive

- ownerId/species filtre + pagination. `archive` soft delete,
  idempotent. Audit: `audit:patient.create` (info),
  `audit:patient.archive` (warning).

**PatientsController** — 4 endpoint (`api/v1/clinic/patients`): POST
create, GET search, GET :id, DELETE :id (archive).

**Sözleşme** (`packages/contracts/src/patient.ts`):
`patientCreateInputSchema`, `patientSearchQuerySchema`, `patientSchema`,
`patientListResponseSchema` (Zod).

**17 yeni test** (`patients.service.spec.ts`): create+audit, mikroçipsiz/
breedsiz, cross-tenant owner 404, `other` tür 422, duplicate mikroçip
409, farklı tenant çakışma yok, gelecek doğum tarihi 422, findById
tenant izolasyonu, search ad/mikroçip/ownerId + tenant izolasyonu,
archive audit + idempotent + 404.

## Tasarım kararları

- **Mikroçip 15 hane unique:** ISO 11784/11785. Aynı tenant'ta aktif
  kayıtlarda unique; farklı tenant aynı mikroçipi kullanabilir.
  Arşivli kayıtlar duplicate kontrolünde DAHİL değildir.
- **Tür whitelist (TR pilot):** `TR_ALLOWED_SPECIES = ["dog","cat",
"bird"]`. `other` henüz aktif değil; genişletme
  `CountryAdapter.isSpeciesAllowed` ile.
- **Owner cross-tenant:** `owners.findById` tenant-scoped çağrılır;
  farklı tenant ID → null → 404 (bilgi sızdırmaz).
- **Append-only:** Archive yalnızca identity gizler; geçmiş muayene/aşı
  etkilenmez. Arşivli hasta default aramada DÖNMEZ.
- **Tenant scope:** `requireTenantScope` her public metoda guard.
  SUPERADMIN bypass; uyumsuz tenant → 403 `VET-AUTHZ-0001`.

## Değişen dosyalar

**Core (5c5cfca):** `apps/api/src/modules/patients/*` (controller,
service, repository, module, spec, index), `apps/api/src/common/
patients/patient.types.ts`, `apps/api/src/app.module.ts`,
`packages/contracts/src/patient.ts` + index.

**Docs & i18n (bu commit):** bu rapor + `PROJECT_CONTEXT.md` ⏳ → ✅

- 4 API doc + `AI_CHUNKS.yaml` (2 yeni chunk: `flow-patient-create`,
  `error-VET-CLINIC-0003`) + `FIELD_GLOSSARY.md` (Patient bölümü).

## Veritabanı

Yok. Service in-memory `PatientsRepository` ile çalışır (FAZ-2 pilot).
Prisma `Patient` modeli + RLS GOAL-026+ ile.

## API

| Method | Path                        | Yetki                  | Kod                  |
| ------ | --------------------------- | ---------------------- | -------------------- |
| POST   | /api/v1/clinic/patients     | clinic:patient:create  | 201                  |
| GET    | /api/v1/clinic/patients     | clinic:patient:read    | 200                  |
| GET    | /api/v1/clinic/patients/:id | clinic:patient:read    | 200/404              |
| DELETE | /api/v1/clinic/patients/:id | clinic:patient:archive | 200/404 (idempotent) |

Hatalar: 404 `VET-AUTHZ-0002` (owner yok), 404 `VET-CLINIC-0001`
(patient yok / cross-tenant), 409 `VET-CLINIC-0003` (mikroçip
duplicate), 422 `VET-CLINIC-0004` (tür) / `VET-VALIDATION-0003`
(mikroçip format) / `VET-VALIDATION-0009` (tarih), 403
`VET-AUTHZ-0001` (tenant uyumsuz).

## Test

17 yeni unit test. Tenant izolasyonu, negative path, idempotent archive
dahil tüm senaryolar geçti. Başarısız: 0.

## Bilinen riskler

- In-memory repo (pilot); DB persistence GOAL-026+ ile.
- Tür whitelist sabit (TR); genişletme ülke adaptörüne taşınacak.
- Fotoğraf: `PatientFile` entegrasyonu GOAL-024 (timeline) kapsamında.

## Sıradaki

GOAL-022 (sahiplik geçmişi, `PatientOwnership` tablosu,
`flow-ownership-transfer` aktif, `audit:patient.transfer`). FAZ-2
sırası: owner ✅ → patient ✅ → ownership → allergies → timeline →
portal.
