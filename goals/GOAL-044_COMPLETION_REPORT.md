# GOAL-044 Completion Report — Tedavi planı ve klinik order

- Goal no: GOAL-044
- Başlık: Tedavi planı ve klinik order (Treatment plan & clinical orders)
- Faz: FAZ-4 (Klinik muayene/aşı/reçete)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: cdc584f

## Yapılan işler (core)

**OrdersService** (`apps/api/src/modules/orders/orders.service.ts`):

- **`create(tenantId, input, actor)`** — Examination
  `ExaminationsService.findById(tenantId, id, actor)` ile aynı tenant'ta
  mı doğrulanır (cross-tenant → 404 `VET-CLINIC-0001`). `status='pending'`,
  `patientId` muayeneden türetilir; client gönderemez. `id =
  order-<tenant8>-000001` (artan sayaç, tenant başına). Audit
  `audit:order.create` (info) — examinationId, patientId, type, status.
- **`list(tenantId, filters, actor)`** — tenant-scoped; `patientId` /
  `type` / `status` / `from` / `to` / `limit` / `offset` filtreleri;
  pagination.
- **`start(tenantId, id, actor)`** — `status='pending'` olan order'ı
  `'in_progress'` yapar. Aksi → 409 `VET-ORDER-0001`. Audit
  `audit:order.update` (info) — before/after status.
- **`complete(tenantId, id, actor)`** — `status='in_progress'` olan
  order'ı `'completed'` yapar; `completedAt` + `completedBy` set.
  Aksi → 409 `VET-ORDER-0001`. Audit `audit:order.update` (info).
- **`cancel(tenantId, id, input, actor)`** — `status='pending'` veya
  `'in_progress'` olan order'ı `'cancelled'` yapar;
  `cancelledAt` + `cancellationReason` set. Tamamlanmış/iptal → 409
  `VET-ORDER-0001`. Audit `audit:order.update` (info).
- **`getTreatmentPlan(tenantId, patientId, actor)`** — Hastaya ait tüm
  order'ları aktif (`pending`+`in_progress`) ve tamamlanmış
  (`completed`+`cancelled`) olarak iki dizide döner. `limit=200`.

**OrdersController** — 6 endpoint (`@Controller("api/v1/clinic")`):

- `POST /api/v1/clinic/examinations/{id}/orders` (`orderCreate`,
  `@HttpCode(201)`, yetki `clinic:examination:create`).
- `GET  /api/v1/clinic/orders` (`orderList`, yetki
  `clinic:patient:read`).
- `POST /api/v1/clinic/orders/{id}/start` (`orderStart`,
  `@HttpCode(200)`, yetki `clinic:examination:create`).
- `POST /api/v1/clinic/orders/{id}/complete` (`orderComplete`,
  `@HttpCode(200)`, yetki `clinic:examination:create`).
- `POST /api/v1/clinic/orders/{id}/cancel` (`orderCancel`,
  `@HttpCode(200)`, yetki `clinic:examination:create`).
- `GET  /api/v1/clinic/patients/{id}/treatment-plan`
  (`patientTreatmentPlan`, yetki `clinic:patient:read`).

**Sözleşme** (`packages/contracts/src/order.ts`):
`orderTypeSchema` (medication | application | procedure | lab | imaging
| vaccination | follow_up | instruction — 7 + 1), `orderStatusSchema`
(pending | in_progress | completed | cancelled), `orderCreateInputSchema`
(type, description zorunlu; notes, dueDate opsiyonel; `.strict()`),
`orderCancelInputSchema` (reason zorunlu), `orderSchema` (response),
`orderFiltersSchema` (patientId, type, status, from, to, limit, offset),
`orderListResponseSchema` (items, total), `orderTreatmentPlanSchema`
(patientId, active[], completed[]).

**Repository** (`orders.repository.ts`): in-memory
`OrdersRepository`; `byId` Map + `counters` (her tenant için artan ID);
`nextId`, `toRecord`, `insert`, `findById`, `search` (tenant + type +
status + from/to + patientId + pagination), `update`, `clear` (test).
`toOrder` yardımcısı.

**12 unit test** (`orders.service.spec.ts`): create başarı + patientId
türetme + audit.create, create cross-tenant → 404, list filtreleri +
pagination, list cross-tenant → boş, start başarı + audit, start
pending değilse → 409 ORDER-0001, complete başarı + completedAt+
completedBy + audit, complete in_progress değilse → 409, cancel
pending+in_progress başarı + audit, cancel completed/cancelled → 409,
getTreatmentPlan aktif/tamamlanmış ayrımı.

## Tasarım kararları

- **State machine:** `pending` → `in_progress` → `completed`. `pending`
  ve `in_progress` → `cancelled` (iptal/iptal+sebep). Tamamlanmış veya
  iptal edilmiş order yeniden `cancelled` olamaz. Geçersiz geçişler
  409 `VET-ORDER-0001`.
- **patientId muayeneden türetilir:** Client gönderemez; service
  `examinations.findById()` sonrası `exam.patientId` kullanır. Bu
  sayede order kaydı tutarlı şekilde muayeneye ve dolayısıyla hastaya
  bağlı kalır; "farklı hayvana order" imkansız.
- **Cross-tenant koruması:** `create` muayene varlık kontrolü
  (`examinations.findById` → cross-tenant 404 `VET-CLINIC-0001`,
  bilgi sızdırmaz). `list` ve `getTreatmentPlan` ayrıca muayene varlık
  kontrolü yapmaz (tenant-scoped sorgu zaten boş döner; okuma
  endpoint'leri, semantik olarak "bu tenant'ın order'ları" demek).
- **Order tipi semantiği:** `medication` ilaç, `application` uygulama
  (pansuman, enjeksiyon, serum), `procedure` cerrahi/prosedür, `lab`
  lab testi, `imaging` görüntüleme, `vaccination` aşı, `follow_up`
  kontrol randevusu (GOAL-046 köprüsü), `instruction` genel talimat.
  Bu 7+1 set tedavi planının temel kapsamıdır; yatış (hospitalization)
  için ortak contract kökü olarak da hizmet eder.
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride. Tenant
  filter tüm çağrılarda enforce edilir.
- **Audit severity:** `create` ve `start`/`complete`/`cancel`
  update'leri → **info** (klinik kayıt denetim izi). `find*` okuma
  işlemleri audit üretmez.

## Doküman ve i18n (bu PR)

- `docs/api/api.post._api_v1_clinic_examinations__id_orders.md`
- `docs/api/api.get._api_v1_clinic_orders.md`
- `docs/api/api.post._api_v1_clinic_orders__id_start.md`
- `docs/api/api.post._api_v1_clinic_orders__id_complete.md`
- `docs/api/api.post._api_v1_clinic_orders__id_cancel.md`
- `docs/api/api.get._api_v1_clinic_patients__id_treatment-plan.md`
- `docs/ai/AI_CHUNKS.yaml` (`flow-treatment-plan` chunk eklendi)
- `docs/errors/ERROR_CATALOG.md` — `VET-ORDER-0001` eklendi
- `packages/i18n/src/locales/{tr-TR,en-GB}.json` —
  `error.VET-ORDER-0001` çevirisi eklendi
- `goals/GOAL-044_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (Faz 4 / GOAL-044 satırı ✅)

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma, status/patient index)
- Frontend tedavi planı UI (order listesi, start/complete/cancel
  aksiyon butonları, type-spesifik form alanları)
- Reçete entegrasyonu (medication order → reçete oluşturma, GOAL-045)
- Kontrol randevusu entegrasyonu (follow_up order → randevu oluşturma,
  GOAL-046)
- Stok düşümü (medication/application order → stok hareketi, GOAL-066)
- DB trigger aktivasyonu (update/delete → reddet, append-only)
