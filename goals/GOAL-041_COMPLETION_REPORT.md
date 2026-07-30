# GOAL-041 Completion Report — SOAP klinik kaydı

- Goal no: GOAL-041
- Başlık: SOAP (Subjective / Objective / Assessment / Plan) klinik kaydı
- Faz: FAZ-4 (Klinik muayene/aşı/reçete)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 7d73ecf

## Yapılan işler

**SoapService** (`apps/api/src/modules/soap/soap.service.ts`):

- **`create(tenantId, examinationId, initial, actor)`** — Examination
  `ExaminationsService.findById(tenantId, id, actor)` ile aynı tenant'ta
  mı doğrulanır (cross-tenant → 404 `VET-CLINIC-0001`). Examination
  `status="in_progress"` olmalı; aksi → 409 `VET-SOAP-0001`. S/O/A/P
  bölümlerinin hepsi opsiyoneldir; boş bırakılırsa `""` set edilir.
  `status="draft"` insert. Audit `audit:soap.create` (info).
- **`findByExamination(tenantId, examinationId, actor)`** — tenant-scoped
  okuma; cross-tenant → `null` (controller 404 `VET-CLINIC-0001`'e map).
- **`update(tenantId, examinationId, input, actor)`** — yalnızca
  `status="draft"` SOAP güncellenebilir; signed/amended → 409
  `VET-SOAP-0001`. Tüm alanlar opsiyonel; sadece gönderilen alanlar
  değişir. Audit `audit:soap.update` (info) — before/after
  S/O/A/P payload.
- **`sign(tenantId, examinationId, actor)`** — yalnızca
  `status="draft"` → `signed`. `signedAt=now`, `signedBy=actor.actorId`.
  **Cross-service:** `ExaminationsService.sign(tenantId, examinationId,
  actor)` çağrılır; muayene de imzalanır (muayene kendi kuralı →
  `status=completed` olmalı; aksi 409 `VET-EXAM-0002` propagation).
  İmza sonrası UPDATE/DELETE trigger (FAZ-0 no-op flag, sadece log).
  Audit `audit:soap.sign` (info).
- **`amend(tenantId, examinationId, input, actor)`** — yalnızca
  `status="signed"` SOAP amend edilebilir; draft/amended → 409
  `VET-SOAP-0001`. Yeni `SoapAmendRecord` kaydı oluşturulur
  (append-only): orijinal S/O/A/P **korunur**, yeni içerik amend
  kaydında saklanır. `SoapNote.status="amended"`, `amendedAt=now`.
  `previousSignedAt` + `previousSignedBy` immutable referans olarak
  amend kaydına kopyalanır. Audit `audit:soap.amend` (**warning**).
- **`listAmends(tenantId, examinationId, actor)`** — tenant-scoped
  amendment listesi (ileride controller detay için kullanılır).

**SoapController** — 5 endpoint (`@Controller("api/v1/clinic/
examinations")` + `:id/soap` sub-resource):

- `POST /api/v1/clinic/examinations/{id}/soap` (`soapCreate`,
  `@HttpCode(201)`, yetki `clinic:examination:create`).
- `GET /api/v1/clinic/examinations/{id}/soap` (`soapGetByExamination`,
  yetki `clinic:examination:read`).
- `PATCH /api/v1/clinic/examinations/{id}/soap` (`soapUpdate`,
  `@HttpCode(200)`, `clinic:examination:create`).
- `POST /api/v1/clinic/examinations/{id}/soap/sign` (`soapSign`,
  `@HttpCode(200)`, `clinic:examination:sign`).
- `POST /api/v1/clinic/examinations/{id}/soap/amend` (`soapAmend`,
  `@HttpCode(200)`, `clinic:examination:sign`).

**Sözleşme** (`packages/contracts/src/soap.ts`): `soapStatusSchema`
(draft | signed | amended), `soapSectionSchema` (max 20000),
`soapUpdateInputSchema` (create + update için ortak body; tüm
alanlar opsiyonel), `soapAmendInputSchema` (reason 1-2000 + 4 bölüm
zorunlu), `soapNoteSchema`, `soapAmendRecordSchema`.

**Repository** (`soap.repository.ts`): in-memory
`SoapNotesRepository` + `SoapAmendsRepository`; ID format
`soap-<tenant8>-<uuid8>` / `soap-amend-<tenant8>-<uuid8>`.
`nextId`, `insert`, `findByExamination`, `update`, `toRecord`,
`toSoapNote` yardımcıları.

**11 unit test** (`soap.service.spec.ts`): create başarı (status=draft
+ audit.info), create cross-tenant examination 404, create
status≠in_progress 409, findByExamination kendi tenant OK,
findByExamination cross-tenant null, update draft OK + audit,
update signed 409, sign draft → signed + examinations.sign tetiklenir
+ audit.info, sign sonrası tekrar sign 409, amend signed → amended +
SoapAmend kaydı + audit.warning, amend draft 409.

## Tasarım kararları

- **S/O/A/P bölümleri:** Subjective (hastanın/subjektif bildirimi),
  Objective (muayene bulguları, ölçümler), Assessment (tanı/klinik
  değerlendirme), Plan (tedavi/izlem). Create + update'te her bölüm
  opsiyonel (draft aşamasında boş olabilir; autosave); amend'te 4
  bölümün tamamı zorunlu (imzalı kayıt üzerinde düzeltme yapıldığı
  için eksik bölüm kabul edilmez).
- **Yaşam döngüsü:** `draft` → `signed` (imza) → `amended` (imza
  sonrası append-only düzeltme). `draft`'ten `amended`'e geçiş yok;
  önce sign, sonra amend. `amended`'den tekrar `signed`'e dönüş yok;
  yeni bir amend daha mümkün, ama orijinal S/O/A/P artık
  değiştirilemez.
- **Cross-service sign:** SOAP imzalandığında Examination da
  imzalanır (`ExaminationsService.sign` çağrısı). Examination
  kendi kuralı nedeniyle `status=completed` olmalı; aksi 409
  `VET-EXAM-0002` propagate olur. Bu sayede SOAP + Examination
  tutarlı şekilde imzalanır; "SOAP signed ama Examination
  completed değil" yarım durumu oluşmaz.
- **Append-only amend:** İmza sonrası `SoapNote` UPDATE/DELETE yasak.
  Düzeltme yalnızca yeni `SoapAmendRecord` + `SoapNote.status=
  "amended"`. Orijinal S/O/A/P bölümleri değişmez; yeni içerik
  amend kaydında snapshot olarak saklanır. `previousSignedAt` +
  `previousSignedBy` immutable referans olarak korunur. Production
  migration'da DB trigger (`signed` → immutable) FAZ-0'da no-op flag.
- **Audit severity:** create/update/sign → info; amend → **warning**
  (imzalı klinik kayıt düzeltilmesi denetim açısından hassas işlem).
- **State machine guard'ları 409:** Yanlış state'ten geçişler
  `VET-SOAP-0001` (state mismatch) → 409 Conflict, details'te
  mevcut `status` ile birlikte. Not found → 404 `VET-CLINIC-0001`
  (cross-tenant ile aynı kod; bilgi sızdırmaz).
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride.
  Tenant filter tüm çağrılarda enforce edilir.

## Doküman ve i18n (bu PR)

- `docs/api/api.post._api_v1_clinic_examinations__id_soap.md`
- `docs/api/api.get._api_v1_clinic_examinations__id_soap.md`
- `docs/api/api.patch._api_v1_clinic_examinations__id_soap.md`
- `docs/api/api.post._api_v1_clinic_examinations__id_soap_sign.md`
- `docs/api/api.post._api_v1_clinic_examinations__id_soap_amend.md`
- `docs/ai/AI_CHUNKS.yaml` (`flow-soap-note` chunk eklendi)
- `goals/GOAL-041_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (Faz 4 / GOAL-041 satırı ✅)
- `docs/errors/ERROR_CATALOG.md` (`VET-SOAP-0001/0002` zaten mevcut,
  doğrulandı)
- `packages/i18n/src/locales/{tr-TR,en-GB}.json` (yeni anahtar yok;
  mevcut `VET-SOAP-0001/0002` anahtarları yeterli)

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma)
- Frontend SOAP form + S/O/A/P bölümleri (`apps/web`)
- e-İmza entegrasyonu (FAZ-5+)
- DB trigger aktivasyonu (signed → immutable)
- SOAP template / kısayol kütüphanesi
- Multi-amend UI (teknik olarak zaten destekliyor: amend → 409 yerine
  tekrar amend kabul; ama UI henüz yok)
