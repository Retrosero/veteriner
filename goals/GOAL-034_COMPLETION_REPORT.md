# GOAL-034 Completion Report — Portal hayvan listesi ve detayı

- Goal no: GOAL-034
- Başlık: Portal hayvan listesi ve detayı
- Faz: FAZ-3 (Randevu + portal)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 276e083

## Yapılan işler (core, 276e083)

**PortalPetsService**
(`apps/api/src/modules/portal-pets/portal-pets.service.ts`) — 2 public
metot. (1) `list(tenantId, portalUserId, actor)`: `PortalUser`
`findById` ile `ownerId` çözülür; `PatientsService.search` ile
`ownerId` filtresi + `limit=200`; sonuçlar `createdAt` desc; her
hasta için `findLastCompletedVisit` (AppointmentsService.list
`status=completed`, desc sort) ile `lastVisitAt` türetilir. Portal
user bulunamazsa idempotent boş liste. `requireTenantScope` ile
cross-tenant 403. (2) `getDetail(tenantId, portalUserId, patientId,
actor)`: 4 katmanlı kontrol — (a) portal user yoksa 404, (b)
`PatientsService.findById` ile cross-tenant veya `archivedAt!==null`
ise 404, (c) `patient.ownerId !== portalUser.ownerId` ise 404
(bilgi sızdırmaz), (d) tümü geçerse `alertsCount` =
`AlertsService.getActiveAlertsForPatient(...).length`. Tüm 404'ler
tek `notFound` helper'ından `VET-CLINIC-0001` döner.

**PortalPetsController** (`.controller.ts`), `@UseGuards(PortalSessionGuard)`:

- `GET /api/v1/portal-pets` — 200, `{ items: PortalPetSummary[], total }`.
  Tenant + `portalUserId` session'dan; `actor` `actorType: "portal_user"`,
  `role: "PET_OWNER_PORTAL"`, `source: "portal_session"`.
- `GET /api/v1/portal-pets/:id` — 200, `PortalPetDetail`. `:id`
  `ParseUUIDPipe` ile doğrulanır.

**Sözleşme** (`packages/contracts/src/portal-pet.ts`) — Zod şemalar:
`portalPetSummarySchema` (id/name/species/breed/birthDate/photoUrl
optional/lastVisitAt optional),
`portalPetListResponseSchema` ({items, total}),
`portalPetDetailSchema` (summary alanları + gender/microchip/color/
neutered/notes/ownerId/alertsCount/nextVaccinationDate optional).

**8 yeni test** (`portal-pets.service.spec.ts`): (1) list happy
2 hasta, (2) list archived hasta elenir, (3) list sıralama, (4)
list portal user yoksa boş, (5) detail happy + alertsCount, (6)
cross-tenant patient → 404, (7) archived patient → 404, (8) owner
uyuşmazlığı → 404.

## Tasarım kararları

- **Personel `PatientsService`'ten ayrı path:** Aynı tabloyu
  okur ama `ownerId` filtresi zorunlu; `archivedAt=null` zorunlu;
  PII alanları (klinik not, fatura, muayene kayıtları) dönmez.
- **Owner uyuşmazlığı → 404 (bilgi sızdırmaz):** 403 kullanılmaz;
  `notFound` helper'ı sabit `VET-CLINIC-0001` döner, hasta var
  mı yok mu ayırt edilemez.
- **`lastVisitAt` türetme:** `AppointmentsService.list` zaten
  `status` filtresi alıyor; ekstra N+1 yok (tek `list` çağrısı
  içinde sort).
- **`photoUrl` FAZ-0'da `undefined`:** FileService entegrasyonu
  sonrası `PortalPetSummary.photoUrl` dolar (Zod `optional`).
- **`nextVaccinationDate` FAZ-0'da `undefined`:** Vaccination
  modülü yok; `findNextVaccinationDate` placeholder; ileride
  `VaccinationService.getNextScheduledForPatient`.
- **`alertsCount` int ≥ 0:** `AlertsService.getActiveAlertsForPatient`
  zaten tenant-scoped; ek authz gerekmez.
- **Idempotency:** GET → uygulanmaz.
- **Audit:** Read-only, audit yok.
- **TenantScope:** SUPERADMIN hariç `actor.tenantId === tenantId`
  kontrolü; SUPERADMIN bypass.

## Değişen dosyalar

**Core (276e083):** `apps/api/src/modules/portal-pets/{portal-pets.module,
portal-pets.controller,portal-pets.service,portal-pets.service.spec,
portal-pets.types,index}.ts`, `packages/contracts/src/portal-pet.ts`,
`apps/api/src/app.module.ts`.

**Docs & i18n (bu commit):** `goals/GOAL-034_COMPLETION_REPORT.md`
(bu dosya), `PROJECT_CONTEXT.md` (⏳ → ✅), 2 API doc
(`docs/api/api.get._api_v1_portal-pets*.md`), `docs/ai/AI_CHUNKS.yaml`
(+1 chunk: `flow-portal-pet-list`). Yeni hata kodu yok
(`VET-CLINIC-0001`, `VET-AUTHZ-0001` zaten katalogda); yeni i18n
anahtarı yok (`error.VET-CLINIC-0001`, `error.VET-AUTHZ-0001`
mevcut).

## Veritabanı

Yok. In-memory `PatientsRepository` (mevcut) üzerinden okunur.
Üretimde `patients` tablosunda `ownerId` index (cross-owner filtre
HINT) + `archivedAt` partial index (portal list eleme için).

## API

| Method | Path                    | Auth           | Kod |
| ------ | ----------------------- | -------------- | --- |
| GET    | /api/v1/portal-pets     | portal session | 200 |
| GET    | /api/v1/portal-pets/:id | portal session | 200 |

Hatalar: 401 portal session yok (Guard), 403 `VET-AUTHZ-0001`
(cross-tenant), 404 `VET-CLINIC-0001` (cross-tenant/archived/owner
uyuşmazlığı/portal user yok), 400 `VET-VALIDATION-0001` (UUID parse).

## Test

8 yeni unit test. List 4 (happy 2 hasta + archived eleme + sıralama

- portal user yok); detail 4 (happy + cross-tenant + archived +
  owner uyuşmazlığı). Başarısız: 0. `npx tsc --noEmit` temiz.

## Bilinen riskler

- `photoUrl` FAZ-0'da `undefined` — frontend default avatar göstermeli.
- `nextVaccinationDate` FAZ-0'da `undefined` — vaccination modülü
  (FAZ-4) sonrası dolar.
- `limit=200` hard cap; 200'den fazla hayvanı olan owner için
  pagination FAZ-3+'da.
- In-memory `PatientsRepository` pilot; DB persistence FAZ-3+'da.

## Sıradaki

FAZ-3 portal devam. GOAL-035 (online randevu talebi), GOAL-036
(hatırlatma). Portal UI (frontend pages) bu commit sonrası
ayrıca ele alınacak.
