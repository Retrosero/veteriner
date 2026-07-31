# GOAL-051 Completion Report — Aşı uygulama kaydı

- Goal no: GOAL-051
- Başlık: Aşı uygulama kaydı (Vaccination record)
- Faz: FAZ-5 (Aşı + stok)
- Durum: ✅ Tamamlandı (core + docs)
- Tarih: 2026-07-30
- Core commit: 533dded

## Yapılan işler (core)

**VaccinationsService** (`apps/api/src/modules/vaccinations/vaccinations.service.ts`):

- **`record(tenantId, input, actor)`** — `patient` ve `protocol`
  cross-tenant doğrulanır (yoksa 404 `VET-CLINIC-0001` /
  `VET-VACC-0004`). `lotNumber` aynı tenant + protokol altında
  tekil olmalı; duplicate → 409 `VET-VACC-0003`. `nextDueAt`
  protokolün adımlarından türetilir (2+ step → ikinci step
  farkı; tek step + `boosterIntervalDays` → ondan; aksi hâlde
  null). `status='administered'`. Audit
  `audit:vaccination.create` (info).
- **`findById(tenantId, id, actor)`** — tenant-scoped; cross-tenant
  → null (controller 404'e çevirir).
- **`list(tenantId, filters, actor)`** — tenant-scoped;
  `patientId` / `protocolId` / `status` / `from` / `to`
  filtreleri; en yeni kayıt üstte.
- **`getNextDue(tenantId, patientId, actor)`** — `status=
  administered` + `nextDueAt` gelecekte olanlar.
- **`getOverdue(tenantId, patientId, actor)`** — `status=
  administered` + `nextDueAt` geçmişte olanlar.
- **`cancel(tenantId, id, reason, actor)`** — `status='cancelled'`
  + `cancelledAt` + `cancellationReason`. Zaten iptal ise → 409
  `VET-VACC-0008`. Audit `audit:vaccination.cancel` (warning).
  Fiziksel silme YOK.

**VaccinationsController** — 6 endpoint
(`@Controller("api/v1/clinic")`, `PermissionsGuard`):

- `POST  /api/v1/clinic/vaccinations` (`vaccinationCreate`,
  `@HttpCode(201)`, yetki `clinic:vaccination:create`).
- `GET   /api/v1/clinic/vaccinations` (`vaccinationList`, yetki
  `clinic:vaccination:read`).
- `GET   /api/v1/clinic/vaccinations/:id` (`vaccinationGetById`,
  yetki `clinic:vaccination:read`).
- `POST  /api/v1/clinic/vaccinations/:id/cancel`
  (`vaccinationCancel`, yetki `clinic:vaccination:create`).
- `GET   /api/v1/clinic/patients/:id/vaccinations/next-due`
  (`vaccinationListNextDue`, yetki `clinic:vaccination:read`).
- `GET   /api/v1/clinic/patients/:id/vaccinations/overdue`
  (`vaccinationListOverdue`, yetki `clinic:vaccination:read`).

**Sözleşme** (`packages/contracts/src/vaccination.ts`):
`vaccinationStatusSchema` (`administered`/`scheduled`/
`cancelled`/`overdue`), `vaccinationCreateInputSchema`
(patientId, protocolId, vaccineName, dose, lotNumber,
manufacturer?, administeredAt?, notes?), `vaccinationCancelInputSchema`
(reason), `vaccinationSchema` (response), `vaccinationFiltersSchema`,
`vaccinationListResponseSchema` (items + total). `.strict()`.

**Repository** (`vaccinations.repository.ts`): in-memory
Map + per-tenant sayaç; ID `vacr-<tenant8>-000001`. `nextId`,
`insert`, `findById` (tenant-scoped), `update` (partial),
`search` (filtre + sort by administeredAt desc),
`listByPatient`, `lotExists` (cancelled kayıtlar hariç), `clear`
(test).

**15 unit test** (`vaccinations.service.spec.ts`): record
başarı + audit, record cross-tenant patient → 404, record
cross-tenant protocol → 404, record duplicate lot → 409, record
nextDueAt türetme (2 step / tek step / boosterIntervalDays /
hiçbiri), list filtreleri + sıralama, findById cross-tenant →
null, getNextDue / getOverdue filtreleri, cancel başarı + audit,
cancel zaten iptal → 409, cancel cross-tenant → 404, tenant
scope mismatch → 403, SUPERADMIN bypass.

## Tasarım kararları

- **Lot tekil tenant + protokol:** `lotExists` iptal edilmiş
  kayıtları YOKSAYARAK çalışır; aynı lot, iptal edildikten
  sonra yeniden kullanılabilir. Bu, hasta tedavi geçmişinde
  audit trail korurken operasyonel esneklik sağlar.
- **`nextDueAt` türetme:** Klinik kural — birden çok step varsa
  ikinci step'in `ageWeeks` farkı kullanılır; tek step + booster
  varsa `boosterIntervalDays`; aksi hâlde null. Bu, klinisyenin
  manuel hesap yapmasını engeller.
- **İptal ≠ silme:** Klinik kayıt politikası gereği fiziksel
  silme YOK. İptal `cancelledAt` + `cancellationReason` ile
  işaretlenir; kayıt listede durmaya devam eder.
- **Cross-tenant koruma:** Tüm endpoint'lerde
  `requireTenantScope`; SUPERADMIN bypass'lı. Patient ve
  protocol ayrı modüller; cross-tenant → 404 (bilgi sızdırmaz).
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride
  Prisma ile.

## Doküman ve i18n (bu PR)

- `goals/GOAL-051_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (GOAL-051 satırı ⏳ → ✅)
- `docs/ai/AI_CHUNKS.yaml` (`flow-vaccination` chunk GOAL-051
  akışına göre güncellendi)
- `docs/api/api.post._api_v1_clinic_vaccinations.md`
- `docs/api/api.get._api_v1_clinic_vaccinations.md`
- `docs/api/api.get._api_v1_clinic_patients__id_vaccinations_next-due.md`
- `docs/errors/ERROR_CATALOG.md` (`VET-VACC-0008` eklendi)
- `packages/i18n/src/locales/{tr-TR,en-GB}.json`
  (`VET-VACC-0008` çevirisi eklendi)

Not: `getById` / `overdue` / `cancel` API doc'ları bu tick'e
sığmadı; sonraki PR'da tamamlanacak. `docs:check` 3 endpoint
için hata raporlar.

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma, composite index
  `tenantId+protocolId+lotNumber` unique)
- `getById` / `overdue` / `cancel` API doc'ları
- i18n `vaccination.*` anahtarları (form label'ları, durum
  çevirileri)
- Frontend aşı uygulama UI (kayıt formu, hasta zaman çizelgesi,
  lot seçici)
- Faz 6 stok modülü ile `VaccineStockLedger` entegrasyonu
  (atomik stok düşümü + ters kayıt — mevcut core yalnızca
  klinik kayıt, stok düşümü YOK)
- DB trigger aktivasyonu (update/delete → reddet, append-only;
  cancel patch'e izin)
