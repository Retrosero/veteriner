# POST /api/v1/clinic/imaging-orders/{id}/schedule

Görüntülemeyi zamanlar. `status='ordered'` → `'scheduled'`.
`scheduledAt` + `room` (örn. röntgen odası).

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:order`
- **Audit:** `audit:imaging_order.schedule` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ImagingOrderScheduleInput`):**

```json
POST /api/v1/clinic/imaging-orders/io-uuid/schedule
{
  "scheduledAt": "2026-07-31T10:00:00.000Z",
  "room": "X-RAY-1",
  "notes": "Sedasyon gerekli"
}
```

- `scheduledAt` (ISO datetime) zorunlu.
- `room` (string, 1-50) zorunlu.
- `notes` opsiyonel.

**Response 200 (`ImagingOrder`):**

`ImagingOrder`; `status='scheduled'`, `scheduledAt`,
`room` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Yalnızca `ordered` planlanabilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- Detay: `GET /api/v1/clinic/imaging-orders/{id}`
- AI chunk: `flow-imaging-order`
- Audit event: `audit:imaging_order.schedule`
