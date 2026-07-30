# POST /api/v1/clinic/orders/{id}/start

`status='pending'` olan order'ı `'in_progress'` yapar. State machine
kuralı: yalnızca pending order başlatılabilir; aksi → 409
`VET-ORDER-0001`.

- **Modül:** orders
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:order.update` (severity: info) — action: "start",
  before/after status.

**Path params:**

- `id` (string, zorunlu) — `order-<tenant8>-<uuid8>`.

**Request body:** Yok.

**Response 200 (`Order`):**

```json
{
  "id": "order-7a1b2c3d-000001",
  "tenantId": "tnt-uuid",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "patientId": "33333333-3333-3333-333333333333",
  "type": "medication",
  "status": "in_progress",
  "description": "Amoksisilin 250 mg — 7 gün, günde 2 defa",
  "notes": null,
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
- `VET-CLINIC-0001` (404) — Order bulunamadı / cross-tenant.
- `VET-ORDER-0001` (409) — Order durumu geçersiz (pending değilse).

**İş kuralları:**

- `existing.status !== 'pending'` → 409 `VET-ORDER-0001` (state
  machine kuralı: yalnızca beklemedeki order başlatılabilir).
- `status='in_progress'` güncellenir; diğer alanlar değişmez.
- Audit `audit:order.update` (info) — before/after status diff.

**Tenant izolasyonu:** Repository `findById(tenantId, id)` /
`update(tenantId, id, ...)` yalnızca `actor.tenantId` kapsamında
çalışır; cross-tenant → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/order.ts`
- Order oluştur: `POST /api/v1/clinic/examinations/{id}/orders`
- Order tamamla: `POST /api/v1/clinic/orders/{id}/complete`
- Order iptal: `POST /api/v1/clinic/orders/{id}/cancel`
- AI chunk: `flow-treatment-plan`
