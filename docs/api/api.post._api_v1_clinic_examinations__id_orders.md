# POST /api/v1/clinic/examinations/{id}/orders

Muayeneye bağlı yeni klinik order oluşturur. `patientId` muayeneden
türetilir; client gönderemez. Yeni order `status='pending'` olarak
başlatılır; yaşam döngüsü state machine ile yönetilir (`pending` →
`in_progress` → `completed`; `pending`/`in_progress` → `cancelled`).

- **Modül:** orders
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:order.create` (severity: info) — examinationId,
  patientId, type, status.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`OrderCreateInput`):**

```json
{
  "type": "medication",
  "description": "Amoksisilin 250 mg — 7 gün, günde 2 defa",
  "notes": "Yemek sonrası. Allerji yok.",
  "dueDate": "2026-08-06T00:00:00.000Z"
}
```

- `type` (enum, zorunlu) — `medication` | `application` | `procedure`
  | `lab` | `imaging` | `vaccination` | `follow_up` | `instruction`.
- `description` (string, 1-2000, zorunlu) — Order açıklaması.
- `notes` (string, max 2000, opsiyonel) — Serbest klinik not.
- `dueDate` (ISO 8601 datetime, opsiyonel) — Order son tarih (ör.
  ilaç bitiş, kontrol zamanı).

**Response 201 (`Order`):**

```json
{
  "id": "order-7a1b2c3d-000001",
  "tenantId": "tnt-uuid",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "patientId": "33333333-3333-3333-333333333333",
  "type": "medication",
  "status": "pending",
  "description": "Amoksisilin 250 mg — 7 gün, günde 2 defa",
  "notes": "Yemek sonrası. Allerji yok.",
  "dueDate": "2026-08-06T00:00:00.000Z",
  "createdAt": "2026-07-30T10:30:00.000Z",
  "createdBy": "usr-vet-uuid",
  "completedAt": null,
  "completedBy": null,
  "cancelledAt": null,
  "cancellationReason": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Body parse hatası (enum, range,
  `.strict()`).
- `VET-CLINIC-0001` (404) — Muayene bulunamadı / cross-tenant.

**İş kuralları:**

- Examination `ExaminationsService.findById(tenantId, id, actor)` ile
  aynı tenant'ta mı doğrulanır; cross-tenant → 404 `VET-CLINIC-0001`
  (bilgi sızdırmaz).
- Zod şema `.strict()` — bilinmeyen alan reddedilir (422
  `VET-VALIDATION-0001`).
- `patientId` muayeneden türetilir; client gönderemez (tutarlılık
  garantisi). `id` client tarafından set edilmez; service
  `order-<tenant8>-000001` (artan sayaç, tenant başına) üretir.
- Yeni order her zaman `status='pending'` olarak başlatılır; diğer
  state'lere geçiş `start` / `complete` / `cancel` endpoint'leri ile
  yapılır.
- `type` semantiği: `medication` ilaç, `application` uygulama
  (pansuman, enjeksiyon, serum), `procedure` cerrahi/prosedür, `lab`
  lab testi, `imaging` görüntüleme, `vaccination` aşı, `follow_up`
  kontrol randevusu (GOAL-046 köprüsü), `instruction` genel talimat.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/order.ts`
- Order listesi: `GET /api/v1/clinic/orders`
- Order başlat: `POST /api/v1/clinic/orders/{id}/start`
- Order tamamla: `POST /api/v1/clinic/orders/{id}/complete`
- Order iptal: `POST /api/v1/clinic/orders/{id}/cancel`
- Tedavi planı: `GET /api/v1/clinic/patients/{id}/treatment-plan`
- AI chunk: `flow-treatment-plan`
