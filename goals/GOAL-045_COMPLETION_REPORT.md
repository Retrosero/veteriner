# GOAL-045 Completion Report — Reçete oluşturma

- Goal no: GOAL-045
- Başlık: Reçete oluşturma (Prescription)
- Faz: FAZ-4 (Klinik muayene/aşı/reçete)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 6e99270

## Yapılan işler (core)

**PrescriptionsService** (`apps/api/src/modules/prescriptions/prescriptions.service.ts`):

- **`create(tenantId, input, actor)`** — Examination
  `ExaminationsService.findById(tenantId, id, actor)` ile aynı tenant'ta
  mı doğrulanır (cross-tenant → 404 `VET-CLINIC-0001`). `items` en az 1
  kalem; boş → 422 `VET-VALIDATION-0010`. `durationDays` 1-30 gün
  (aşımı → 422 `VET-VALIDATION-0010`); `expiresAt = now +
durationDays` gün. `status='active'`. `id =
prsc-<tenant8>-000001` (artan sayaç, tenant başına). Audit
  `audit:prescription.create` (info) — examinationId, patientId,
  items, status, expiresAt.
- **`findById(tenantId, id, actor)`** — tenant-scoped; cross-tenant →
  null. Controller 404 `VET-CLINIC-0001` raise eder.
- **`list(tenantId, filters, actor)`** — tenant-scoped; `patientId` /
  `status` / `from` / `to` / `limit` / `offset` filtreleri; pagination.
- **`dispense(tenantId, id, actor)`** — `status='active'` olan
  reçeteyi `'dispensed'` yapar; `dispensedAt` + `dispensedBy` set.
  Aksi → 409 `VET-PRESC-0003`. Audit
  `audit:prescription.dispense` (info).
- **`cancel(tenantId, id, input, actor)`** — `status='active'` olan
  reçeteyi `'cancelled'` yapar; `cancelReason` set. Zaten iptal/
  `expired`/`completed` → 409 `VET-PRESC-0004`. Audit
  `audit:prescription.cancel` (warning).
- **`expireOverdue()`** — periyodik job; tüm tenant'larda
  `status='active' && expiresAt < now` olan reçeteleri `'expired'`
  yapar. Dönüş: güncellenen kayıt sayısı. Audit
  `audit:prescription.expire` (info) per record.
- **`pdf(tenantId, id, actor)`** — FAZ-0 placeholder `text/plain`
  buffer (id, items, expiresAt, dispensed bilgisi). Gerçek PDF render
  FAZ-10+'da. Audit `audit:prescription.pdf` (info).

**PrescriptionsController** — 6 endpoint (`@Controller("api/v1/clinic")`):

- `POST /api/v1/clinic/examinations/{id}/prescriptions`
  (`prescriptionCreate`, `@HttpCode(201)`, yetki
  `clinic:prescription:create`).
- `GET  /api/v1/clinic/prescriptions/{id}` (`prescriptionGetById`,
  yetki `clinic:prescription:read`).
- `GET  /api/v1/clinic/prescriptions` (`prescriptionList`, yetki
  `clinic:prescription:read`).
- `POST /api/v1/clinic/prescriptions/{id}/dispense`
  (`prescriptionDispense`, `@HttpCode(200)`, yetki
  `clinic:prescription:dispense`).
- `POST /api/v1/clinic/prescriptions/{id}/cancel`
  (`prescriptionCancel`, `@HttpCode(200)`, yetki
  `clinic:prescription:cancel`).
- `GET  /api/v1/clinic/prescriptions/{id}/pdf` (`prescriptionPdf`,
  yetki `clinic:prescription:read`, FAZ-0 placeholder).

**Sözleşme** (`packages/contracts/src/prescription.ts`):
`prescriptionStatusSchema` (active | dispensed | cancelled | expired |
completed), `prescriptionFrequencySchema` (once_daily | twice_daily |
three_times_daily | every_8h | every_12h | as_needed | custom),
`prescriptionRouteSchema` (oral | topical | injection_im |
injection_iv | injection_sc | inhalation | other),
`prescriptionItemSchema` (drugName, dosage, frequency, customFrequency,
durationDays 1-365, route, instructions),
`prescriptionCreateInputSchema` (examinationId, items ≥1, notes,
durationDays 1-30), `prescriptionCancelInputSchema` (reason zorunlu),
`prescriptionSchema` (response), `prescriptionFiltersSchema` (patientId,
status, from, to, limit 1-200 default 20, offset 0-10000 default 0),
`prescriptionListResponseSchema` (items, total).

**Repository** (`prescriptions.repository.ts`): in-memory
`PrescriptionsRepository`; `byId` Map + `counters` (her tenant için
artan ID); `nextId`, `toRecord`, `insert`, `findById`, `search`
(tenant + status + from/to + patientId + pagination), `findAllActive`
(expire job için), `update`, `clear` (test). `toPrescription` yardımcısı.

**17 unit test** (`prescriptions.service.spec.ts`): create başarı +
expiresAt + audit, items boş → 422, durationDays 31/0 → 422,
cross-tenant → 404, findById kendi tenant / cross-tenant → null, list
patientId + status filtreleri, dispense başarı + dispensedAt +
dispensedBy + audit, dispense active değilse → 409 PRESC-0003, cancel
başarı + cancelReason + audit (warning), cancel zaten iptal → 409
PRESC-0004, expireOverdue süresi geçen aktif reçeteleri expired yapar

- count, expireOverdue hiç overdue yoksa 0, pdf placeholder buffer +
  audit, pdf cross-tenant → 404.

## Tasarım kararları

- **State machine:** `active` → (`dispensed` | `cancelled` | `expired`
  | `completed`). `expired` ve `completed` FAZ-0'da terminate
  durumlar; geçiş `expireOverdue` job'ı veya manuel tetikleme ile.
  Geçersiz geçişler 409 (`VET-PRESC-0003` dağıtım için, `VET-PRESC-0004`
  iptal için).
- **items listesi:** Reçete en az 1 ilaç/ürün kalemi içermelidir;
  boş items → 422 `VET-VALIDATION-0010`. Her kalem bağımsız `drugName`,
  `dosage`, `frequency`, `durationDays` (1-365 kalem başı), `route`,
  `instructions` taşır; reçete seviyesinde `durationDays` 1-30 gün
  ile son kullanma (`expiresAt`) hesaplanır.
- **expiresAt = now + durationDays:** Service katmanında
  hesaplanır; client gönderemez. `expireOverdue` periyodik job'ı
  tüm tenant'larda aktif+expired kontrolü yapar. Audit her
  expire edilen kayıt için info seviyesinde.
- **Cross-tenant koruması:** `create` examination varlık kontrolü
  (`examinations.findById` → cross-tenant 404 `VET-CLINIC-0001`,
  bilgi sızdırmaz). `findById`/`list` tenant-scoped; `pdf` de
  tenant-scoped + cross-tenant → 404.
- **Append-only politika:** Reçete klinik kayıttır; fiziksel silme
  yok. İptal `cancelled` durumu + `cancelReason` ile; düzeltme
  `cancel` + yeni reçete. PDF FAZ-0'da text placeholder;
  gerçek render FAZ-10+'da.
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride.
  Tenant filter tüm çağrılarda enforce edilir.
- **Audit severity:** `create` / `dispense` / `expire` → **info**.
  `cancel` → **warning** (iptal hassas işlem). `pdf` → **info**.
  `find*` okuma işlemleri audit üretmez.

## Doküman ve i18n (bu PR)

- `docs/api/api.post._api_v1_clinic_examinations__id_prescriptions.md`
- `docs/api/api.get._api_v1_clinic_prescriptions__id.md`
- `docs/api/api.get._api_v1_clinic_prescriptions.md`
- `docs/api/api.post._api_v1_clinic_prescriptions__id_dispense.md`
- `docs/api/api.post._api_v1_clinic_prescriptions__id_cancel.md`
- `docs/api/api.get._api_v1_clinic_prescriptions__id_pdf.md`
- `docs/ai/AI_CHUNKS.yaml` (`flow-prescription-create` ve
  `flow-prescription-dispense` chunk'ları eklendi)
- `goals/GOAL-045_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (Faz 4 / GOAL-045 satırı ✅)
- i18n: `error.VET-PRESC-0001..0004` anahtarları core commit'te
  mevcut; bu PR'da yeni anahtar eklenmedi.

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma, status/patient/expiry index)
- Frontend reçete formu (items tablosu, drug autocomplete, dozaj
  şablonları, PDF önizleme)
- Stok düşümü (dispense → stok hareketi, GOAL-066)
- İlaç/ürün kataloğu entegrasyonu (FAZ-5+)
- Yeniden yazdırma / düzeltme (amend) endpoint'i (yetki mevcut,
  implementasyon ileride)
- Gerçek PDF render (FAZ-10+, şu an text placeholder)
- DB trigger aktivasyonu (update/delete → reddet, append-only)
