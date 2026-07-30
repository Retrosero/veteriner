# GOAL-043 Completion Report — Teşhis ve problem listesi

- Goal no: GOAL-043
- Başlık: Teşhis ve problem listesi (Diagnoses & problem list)
- Faz: FAZ-4 (Klinik muayene/aşı/reçete)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 128eaa7

## Yapılan işler (core)

**DiagnosesService** (`apps/api/src/modules/diagnoses/diagnoses.service.ts`):

- **`add(tenantId, input, actor)`** — Examination
  `ExaminationsService.findById(tenantId, id, actor)` ile aynı tenant'ta
  mı doğrulanır (cross-tenant → 404 `VET-CLINIC-0001`). `status='active'`,
  `category` input'tan. `patientId` muayeneden türetilir; client
  gönderemez. `id = diagnosis-<tenant8>-000001` (artan sayaç, tenant
  başına). Audit `audit:diagnosis.create` (info) —
  examinationId, patientId, category, status, code.
- **`listForExamination(tenantId, examinationId, actor)`** —
  tenant-scoped, arşivlenmemiş kayıtlar, oluşturma zamanına göre
  sıralı. Cross-tenant → boş dizi (bilgi sızdırmaz).
- **`listForPatient(tenantId, patientId, actor, filters)`** — Hastanın
  tüm muayenelerinden teşhisleri toplar; opsiyonel `status` ve
  `includeArchived` filtreleri.
- **`resolve / setChronic / setRuledOut(tenantId, id, actor)`** —
  Teşhis state machine: yalnızca `active` olan teşhisler
  `resolved`/`chronic`/`ruled_out`'a geçebilir; aksi → 409
  `VET-DIAG-0001`. `resolve` `resolvedAt` set eder. Audit
  `audit:diagnosis.{resolve,chronic,ruled_out}` (info).
- **`remove(tenantId, id, actor)`** — Soft delete: `archivedAt`
  set edilir; klinik kayıt append-only olduğu için fiziksel
  silme yapılmaz. Idempotent: zaten arşivli → no-op. Audit
  `audit:diagnosis.archive` (warning).

**DiagnosesController** — 7 endpoint (`@Controller("api/v1/clinic")`):

- `POST   /api/v1/clinic/examinations/{id}/diagnoses` (`diagnosisAdd`,
  `@HttpCode(201)`, yetki `clinic:examination:create`).
- `GET    /api/v1/clinic/examinations/{id}/diagnoses`
  (`diagnosisListForExamination`, yetki `clinic:examination:read`).
- `GET    /api/v1/clinic/patients/{id}/diagnoses`
  (`diagnosisListForPatient`, yetki `clinic:patient:read`).
- `POST   /api/v1/clinic/diagnoses/{id}/resolve` (`diagnosisResolve`,
  `@HttpCode(200)`, yetki `clinic:examination:create`).
- `POST   /api/v1/clinic/diagnoses/{id}/chronic` (`diagnosisSetChronic`,
  `@HttpCode(200)`, yetki `clinic:examination:create`).
- `POST   /api/v1/clinic/diagnoses/{id}/ruled-out`
  (`diagnosisRuledOut`, `@HttpCode(200)`, yetki
  `clinic:examination:create`).
- `DELETE /api/v1/clinic/diagnoses/{id}` (`diagnosisArchive`,
  `@HttpCode(200)`, yetki `clinic:examination:create`).

**Sözleşme** (`packages/contracts/src/diagnosis.ts`):
`diagnosisCategorySchema` (primary | secondary | differential |
rule_out), `diagnosisStatusSchema` (active | resolved | chronic |
ruled_out), `diagnosisCreateInputSchema` (name, category zorunlu;
code, notes opsiyonel; `.strict()`), `diagnosisSchema` (response),
`diagnosisPatientListFiltersSchema` (status, includeArchived).

**Repository** (`diagnoses.repository.ts`): in-memory
`DiagnosesRepository`; `byId` Map + `counters` (her tenant için
artan ID); `nextId`, `toRecord`, `insert`, `findById`,
`findByExaminationId`, `findByPatientId` (status + archived
filtreleri), `update`, `clear` (test). `toDiagnosis` yardımcısı.

**14 unit test** (`diagnoses.service.spec.ts`): add başarı +
patientId türetme + audit.create, add cross-tenant → 404, 3
teşhis listeleme, arşivlenmiş kayıt listelenmez, status filtresi,
resolve başarı + resolvedAt + audit, resolve active değilse → 409
DIAG-0001, setChronic başarı + audit, setChronic active değilse
→ 409 DIAG-0001, setRuledOut differential kategorili → ruled_out,
setRuledOut primary → ruled_out, setRuledOut resolved → 409
DIAG-0001, archive archivedAt + audit.archive, cross-tenant
update → 404.

## Tasarım kararları

- **State machine:** `active` → {`resolved`, `chronic`, `ruled_out`}.
  `differential` kategorisindeki teşhis `ruled_out` ile elenebilir
  (FAZ-4 kuralı). Geçersiz geçişler 409 `VET-DIAG-0001`.
- **Append-only politika:** Teşhis kaydı klinik kayıttır; mevcut
  kayıt üzerinde UPDATE/DELETE yok. Soft delete `archivedAt` set
  eder; arşivlenen kayıtlar listeleme yanıtından çıkar. Yanlış
  teşhis düzeltmesi yeni teşhis kaydı (`code` veya `notes` ile
  belirtilir) ile yapılır; önceki kayıt korunur.
- **patientId muayeneden türetilir:** Client gönderemez; service
  `examinations.findById()` sonrası `exam.patientId` kullanır. Bu
  sayede teşhis kaydı tutarlı şekilde muayeneye ve dolayısıyla
  hastaya bağlı kalır; "farklı hayvana teşhis" imkansız.
- **Cross-tenant koruması:** `add` muayene varlık kontrolü
  (`examinations.findById` → cross-tenant 404 `VET-CLINIC-0001`,
  bilgi sızdırmaz). `listForExamination` ayrıca muayene varlık
  kontrolü yapmaz (tenant-scoped sorgu zaten boş döner; okuma
  endpoint'i, semantik olarak "o muayenenin teşhis listesi" demek).
- **Idempotent archive:** Zaten arşivli kayıt için `remove`
  no-op; ek audit yazılmaz. Listeleme/arşiv arası race durumunda
  güvenli.
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride.
  Tenant filter tüm çağrılarda enforce edilir.
- **Audit severity:** `create/resolve/chronic/ruled_out` →
  **info** (klinik kayıt denetim izi). `archive` → **warning**
  (soft delete hassas işlem). `find*` okuma işlemleri audit
  üretmez.

## Doküman ve i18n (bu PR)

- `docs/api/api.post._api_v1_clinic_examinations__id_diagnoses.md`
- `docs/api/api.get._api_v1_clinic_examinations__id_diagnoses.md`
- `docs/api/api.get._api_v1_clinic_patients__id_diagnoses.md`
- `docs/api/api.post._api_v1_clinic_diagnoses__id_resolve.md`
- `docs/api/api.post._api_v1_clinic_diagnoses__id_chronic.md`
- `docs/api/api.post._api_v1_clinic_diagnoses__id_ruled-out.md`
- `docs/api/api.delete._api_v1_clinic_diagnoses__id.md`
- `docs/ai/AI_CHUNKS.yaml` (`flow-diagnosis` chunk eklendi)
- `docs/errors/ERROR_CATALOG.md` — `VET-DIAG-0001` eklendi
- `packages/i18n/src/locales/{tr-TR,en-GB}.json` —
  `error.VET-DIAG-0001` çevirisi eklendi
- `goals/GOAL-043_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (Faz 4 / GOAL-043 satırı ✅)

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma, status/patient index)
- Frontend teşhis formu (kategori dropdown, ICD-10 vet kodu
  autocomplete, kronik/ruled_out/resolve aksiyon butonları)
- ICD-10 vet kod kataloğu entegrasyonu (FAZ-4'te `code` opsiyonel)
- DB trigger aktivasyonu (update/delete → reddet, append-only)
- Differential → confirmed geçiş akışı (status eklenirse)
- Tedavi planı ile teşhis bağlama (GOAL-044 kapsamında)
