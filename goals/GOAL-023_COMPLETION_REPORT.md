# GOAL-023 Completion Report — Alerji, kronik durum ve klinik uyarılar

- Goal no: GOAL-023
- Başlık: Alerji, kronik durum ve klinik uyarılar
- Faz: FAZ-2 (Klinik domain)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: adefd4a

## Yapılan işler

**AlertsService** (`apps/api/src/modules/alerts/alerts.service.ts`):
5 metot — `add`, `listForPatient`, `getActiveAlertsForPatient`,
`archive`, `checkMedicationConflict`. In-memory `byId` Map'te
tutulur; `requireTenantScope` ile tenant bağlamı doğrulanır.
(1) `add`: patient aynı tenant'ta değilse 404 `VET-AUTHZ-0002`
(bilgi sızdırmaz). (2) Severity `critical` ise audit
`audit:alert.create` (info) yayınlanır; `warning`/`info` için audit
yok (gürültü kontrolü). (3) `listForPatient`: tenant-scoped,
`severity` + `activeOnly` filtreleri; `createdAt` azalan sıralı.
(4) `getActiveAlertsForPatient`: aktif kayıtlar
(`archivedAt=null` VE `expiresAt>now|null`), severity weight'a
göre azalan (critical > warning > info). (5) `archive`: soft
delete (`archivedAt` set), audit `audit:alert.archive` (info),
idempotent. (6) `checkMedicationConflict`: yalnızca aktif
`allergy` veya `chronic_condition` kayıtlarında
`title/description` üzerinde case-insensitive substring match.

**AlertsController** — 3 yeni endpoint
(`apps/api/src/modules/alerts/alerts.controller.ts`):
- `POST /api/v1/clinic/patients/:patientId/alerts` —
  `clinic:examination:create`, 201.
- `GET /api/v1/clinic/patients/:patientId/alerts?severity=...&activeOnly=...` —
  `clinic:patient:read`, 200.
- `DELETE /api/v1/clinic/alerts/:id` — `clinic:examination:create`,
  204 (idempotent soft delete).
Swagger: `operationId: alertCreate | alertListForPatient |
alertArchive`. `ZodValidationPipe` ile input doğrulama.

**Sözleşme** (`packages/contracts/src/alert.ts`):
`alertCreateInputSchema` (Zod) — `category` (allergy |
chronic_condition | medication_conflict | behavior), `severity`
(info | warning | critical), `title` (1-200), `description`
(1-2000), `expiresAt` (opsiyonel ISO 8601). `alertSchema`,
`alertListQuerySchema`, `alertListResponseSchema`. `alertId` formatı
`alt-<tenant8>-<uuid8>`.

**13 yeni test** (`alerts.service.spec.ts`): 3 add (başarı +
warning no-audit, critical + audit, cross-tenant 404), 4
listForPatient (severity filter, expired exclusion, archived
exclusion, tenant isolation), 1 getActiveAlertsForPatient
(severity order), 2 archive (audit + idempotent), 3
checkMedicationConflict (title match, description match, no match).

## Tasarım kararları

- **Severity sıralaması:** `info` < `warning` < `critical` (weight
  0/1/2). `getActiveAlertsForPatient` UI için severity weight'a
  göre azalan sırada döner. Normal `listForPatient` ise
  `createdAt` azalan — UI severity'ye göre gruplayabilir.
- **Audit sadece critical'da:** Bilgi amaçlı uyarılar (`info`)
  ve operasyonel hatırlatmalar (`warning`) audit gürültüsü
  yaratır; `critical` (örn. anafilaksi) audit gerektirir çünkü
  klinik karar zincirini etkiler.
- **expiresAt semantiği:** `activeOnly=true` filtresi
  `expiresAt<now` olanları dışlar; ancak ham `listForPatient`
  döner. UI "süresi dolmuş" pasif bölümü gösterebilir.
- **Medication conflict: basit substring:** Tam eşleşme yerine
  case-insensitive substring; yanlış pozitif mümkündür
  (örn. "Penisilin" ↔ "Penisilinaz"). RxNorm/ilaç sözlüğü
  entegrasyonu FAZ-3+'da.
- **Soft delete:** Klinik kayıtlar append-only; arşiv geri
  alınamaz. Yeniden aktif etmek için yeni uyarı oluşturulur.
- **Yeni hata kodu:** Core `VET-CLINIC-0010` (Uyarı bulunamadı,
  404, info) ekledi — katalog + i18n bu commit ile birlikte
  güncellendi.

## Değişen dosyalar

**Core (adefd4a):** `apps/api/src/modules/alerts/` (modül +
controller + service + spec), `apps/api/src/common/alerts/alert.types.ts`,
`packages/contracts/src/alert.ts` (yeni), `packages/contracts/src/index.ts`.

**Docs & i18n (bu commit):** bu rapor + `PROJECT_CONTEXT.md` ⏳ → ✅ +
3 API doc + `AI_CHUNKS.yaml` (2 yeni chunk: `flow-allergy-warning`,
`medication-conflict-check`) + `ERROR_CATALOG.md`
(+VET-CLINIC-0010) + `tr-TR.json` + `en-GB.json`
(+VET-CLINIC-0010).

## Veritabanı

Yok. In-memory `byId` Map. Production'a geçişte Prisma
`PatientAlert` tablosu + `tenantId/patientId/archivedAt` index.

## API

| Method | Path                                          | Yetki                       | Kod |
| ------ | --------------------------------------------- | --------------------------- | --- |
| POST   | /api/v1/clinic/patients/:patientId/alerts     | clinic:examination:create   | 201 |
| GET    | /api/v1/clinic/patients/:patientId/alerts     | clinic:patient:read         | 200 |
| DELETE | /api/v1/clinic/alerts/:id                     | clinic:examination:create   | 204 |

Hatalar: 404 `VET-AUTHZ-0002` (patient cross-tenant), 404
`VET-CLINIC-0010` (alert not found / cross-tenant), 403
`VET-AUTHZ-0001` (tenant uyumsuz), 401 `VET-AUTH-0001`, 400
`VET-TENANT-0001`, 400 `VET-VALIDATION-0001`.

## Test

13 yeni unit test. Tenant izolasyonu, severity filter,
`activeOnly` (expiresAt + archivedAt), archive idempotency,
medication conflict substring match (title + description), audit
critical-only. Başarısız: 0.

## Bilinen riskler

- In-memory `byId` Map (pilot); DB persistence FAZ-3+'da.
- `medicationConflict` basit substring — yanlış pozitif
  mümkün; gelişmiş eşleşme (RxNorm) sonraki faz.
- Audit yalnızca critical uyarılarda; `warning` audit
  ihtiyacı olursa flag ile açılabilir.
- Hasta sahibi portal `clinic:patient:read` `self_only`
  filtresiyle kendi hayvanının uyarılarını görebilir; bu
  davranış `api.get` permission gate'inde tanımlı (FAZ-2
  portal tarafı).

## Sıradaki

GOAL-024 (hayvan zaman çizelgesi).
