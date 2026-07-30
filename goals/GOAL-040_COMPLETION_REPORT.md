# GOAL-040 Completion Report — Muayene yaşam döngüsü

- Goal no: GOAL-040
- Başlık: Muayene başlatma ve yaşam döngüsü
- Faz: FAZ-4 (Klinik muayene/aşı/reçete)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 3546217

## Yapılan işler

**ExaminationsService** (`apps/api/src/modules/examinations/examinations.service.ts`):

- **`start(tenantId, input, actor)`** — `appointmentId` + `type`
  (consultation/follow_up/emergency/routine_check) + `chiefComplaint`
  alır. `AppointmentsService.findById` ile appointment aynı tenant'ta
  mı doğrular (cross-tenant → 404 `VET-CLINIC-0001`). Patient
  `findById(tenantId, appt.patientId)` ile aynı tenant'ta mı
  doğrulanır; `patientId` + `veterinarianId` appointment'tan türetilir.
  Status `in_progress` olarak insert. Audit
  `audit:examination.create` (info) — appointmentId, patientId,
  veterinarianId, type, status.
- **`findById(tenantId, id, actor)`** — tenant-scoped; cross-tenant →
  null (controller 404'e map eder).
- **`list(tenantId, filters, actor)`** — patientId, veterinarianId,
  status, from, to filtreleri; pagination (limit 1-200, offset
  0-10000). Tenant-scoped search.
- **`complete(tenantId, id, actor)`** — `status !== "in_progress"` →
  409 `VET-EXAM-0001`. Status `completed`, `completedAt=now`.
  Audit `audit:examination.update` (info) — before/after
  status+completedAt.
- **`sign(tenantId, id, actor)`** — `status !== "completed"` → 409
  `VET-EXAM-0002`. `signedAt=now`, `signedBy=actor.actorId`. İmza
  sonrası **UPDATE/DELETE trigger aktifleşir** (FAZ-0'da no-op flag,
  sadece log; production migration'da DB trigger). Audit
  `audit:examination.sign` (info) — signedAt, signedBy,
  previousStatus.
- **`amend(tenantId, id, input, actor)`** — `input.reason` (1-2000
  karakter). Yeni `ExaminationAmend` kaydı oluşturulur
  (append-only): önceki `signedAt/signedBy` referansı saklanır.
  Examination status `amended` yapılır. Audit
  `audit:examination.amend` (**warning**) — amendId, reason,
  previousStatus, previousSignedAt, previousSignedBy.
- **`listAmends(tenantId, examinationId, actor)`** — tenant-scoped
  amendment listesi (controller `amend` sonrası son kaydı döner).

**ExaminationsController** — 6 endpoint:

- `POST /api/v1/clinic/examinations` (`operationId: examinationStart`,
  `@HttpCode(201)`, yetki `clinic:examination:create`).
- `GET /api/v1/clinic/examinations` (`examinationList`, `clinic:examination:read`).
- `GET /api/v1/clinic/examinations/:id` (`examinationGetById`,
  `clinic:examination:read`).
- `POST /api/v1/clinic/examinations/:id/complete` (`examinationComplete`,
  `@HttpCode(200)`, `clinic:examination:create`).
- `POST /api/v1/clinic/examinations/:id/sign` (`examinationSign`,
  `@HttpCode(200)`, `clinic:examination:sign`).
- `POST /api/v1/clinic/examinations/:id/amend` (`examinationAmend`,
  `@HttpCode(200)`, `clinic:examination:amend`).

**Sözleşme** (`packages/contracts/src/examination.ts`):
`examinationTypeSchema` (consultation | follow_up | emergency |
routine_check), `examinationStatusSchema` (in_progress | completed |
amended), `examinationCreateInputSchema` (appointmentId + type +
chiefComplaint 1-2000), `examinationAmendInputSchema` (reason
1-2000), `examinationSchema`, `examinationAmendSchema`,
`examinationFiltersSchema`, `examinationListResponseSchema`.

**Repository** (`examinations.repository.ts`): in-memory
`ExaminationsRepository` + `ExaminationAmendsRepository`; ID format
`exam-<tenant8>-<uuid8>` / `exam-amend-<tenant8>-<uuid8>`. Search
patientId/veterinarianId/status/from/to + pagination.

**12 unit test** (`examinations.service.spec.ts`): start happy path,
start cross-tenant appointment 404, start cross-tenant patient 404,
findById cross-tenant null, list filtreleri, complete in_progress
başarı, complete completed 409, complete not found 404, sign
completed başarı + immutability log, sign not completed 409, sign
already signed 409, amend append-only kayıt oluşturma + status
amended + audit warning.

## Tasarım kararları

- **Yaşam döngüsü:** `in_progress` (başlat) → `completed` (kapat) →
  imza (`signedAt/signedBy` set) → `amended` (append-only düzeltme).
  İmza atılmadan `amend` anlamlı değil; service yalnızca amendment
  kaydı oluşturur, önceki imza referansını saklar.
- **Append-only klinik kayıt politikası:** İmza sonrası doğrudan
  UPDATE/DELETE yasak. Düzeltme yalnızca yeni `ExaminationAmend`
  kaydı ile. Production'da DB trigger (signed → immutable) FAZ-0'da
  no-op flag; trigger aktifleştiğinde aynı davranış korunur.
- **patientId/veterinarianId türetme:** Service katmanı muayene
  başlatırken bu alanları `appointmentId`'den çeker; request body'de
  kabul edilmez. Cross-tenant veya farklı tenant appointment → 404
  (bilgi sızdırmaz).
- **Audit severity:** create/update/sign → info; amend → **warning**
  (klinik kayıt düzeltilmesi denetim açısından hassas işlem).
- **State machine guard'ları 409:** Yanlış state'ten geçişler
  `VET-EXAM-0001` (complete guard) / `VET-EXAM-0002` (sign guard) →
  409 Conflict, body'de mevcut status ile birlikte.
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride.
  Tenant filter tüm çağrılarda enforce edilir.

## Doküman ve i18n (bu PR)

- `docs/api/api.post._api_v1_clinic_examinations*.md` (6 dosya)
- `docs/ai/AI_CHUNKS.yaml` (flow-examination-create, flow-examination-sign)
- `goals/GOAL-040_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (Faz 4 / GOAL-040 satırı ✅)

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma)
- Frontend sayfa + form (`apps/web`)
- SOAP/vital/teşhis/tedavi modülleri (GOAL-041..044)
- e-İmza entegrasyonu (FAZ-5+)
- DB trigger aktivasyonu (imza → immutable)
