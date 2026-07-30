# POST /api/v1/clinic/orders/{id}/cancel

`status='pending'` veya `'in_progress'` olan order'ı `'cancelled'`
yapar; `cancelledAt` + `cancellationReason` set edilir. State machine
kuralı: tamamlanmış/iptal edilmiş order iptal edilemez; aksi → 409
`VET-ORDER-0001`.

- **Modül:** orders
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:order.update` (severity: info) — action: "cancel",
  before/after status + cancellationReason.

**Path params:**

- `id` (string, zorunlu) — `order-<tenant8>-<uuid8>`.

**Request body (`OrderCancelInput`):**

```json
{
  "reason": "Hasta ilaç allerjisi tespit edildi."
}
```

- `reason` (string, 1-2000, zorunlu) — İptal sebebi.

**Response 200 (`Order`):**

```json
{
  "id": "order-7a1b2c3d-000001",
  "tenantId": "tnt-uuid",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "patientId": "33333333-3333-3333-333333333333",
  "type": "medication",
  "status": "cancelled",
  "description": "Amoksisilin 250 mg — 7 gün, günde 2 defa",
  "notes": null,
  "dueDate": "2026-08-06T00:00:00.000Z",
  "createdAt": "2026-07-30T10:30:00.000Z",
  "createdBy": "usr-vet-uuid",
  "completedAt": null,
  "completedBy": null,
  "cancelledAt": "2026-07-30T11:20:00.000Z",
  "cancellationReason": "Hasta ilaç allerjisi tespit edildi."
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Body parse hatası (`reason` eksik/
  boş).
- `VET-CLINIC-0001` (404) — Order bulunamadı / cross-tenant.
- `VET-ORDER-0001` (409) — Order durumu geçersiz (completed veya
  cancelled ise).

**İş kuralları:**

- `existing.status === 'completed' || 'cancelled'` → 409
  `VET-ORDER-0001` (state machine kuralı: tamamlanmış/iptal edilmiş
  order iptal edilemez).
- `status='cancelled'`, `cancelledAt` = şu an, `cancellationReason` =
  input.reason set edilir; diğer alanlar değişmez.
- `reason` zorunlu; klinik denetim izi için sebep kaydı zorunludur.
- Zod şema `.strict()` — bilinmeyen alan reddedilir (422
  `VET-VALIDATION-0001`).
- Audit `audit:order.update` (info) — before/after status +
  cancellationReason diff.

**Tenant izolasyonu:** Repository `findById(tenantId, id)` /
`update(tenantId, id, ...)` yalnızca `actor.tenantId` kapsamında
çalışır; cross-tenant → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/order.ts`
- Order başlat: `POST /api/v1/clinic/orders/{id}/start`
- Order tamamla: `POST /api/v1/clinic/orders/{id}/complete`
- AI chunk: `flow-treatment-plan`
