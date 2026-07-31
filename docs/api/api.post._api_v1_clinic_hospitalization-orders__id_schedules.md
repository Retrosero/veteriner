# POST /api/v1/clinic/hospitalization-orders/{id}/schedules

Order için zamanlama (schedule) ekler. `scheduledAt` +
`dose` (bu uygulama için). Schedule'lar uygulanır/skip
edilir.

- **Modül:** hospitalization-orders
- **Yetki:** `clinic:hospitalization:add_note`
- **Audit:** `audit:hospitalization_order.schedule.add` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`HospitalizationOrderScheduleInput`):**

```json
POST /api/v1/clinic/hospitalization-orders/ho-uuid/schedules
{
  "scheduledAt": "2026-07-31T08:00:00.000Z",
  "dose": "1 tablet",
  "notes": "Sabah dozu"
}
```

- `scheduledAt` (ISO datetime) zorunlu.
- `dose` (string) opsiyonel (default order.dose).
- `notes` opsiyonel.

**Response 201 (`HospitalizationOrderSchedule`):**

```json
{
  "id": "hos-uuid",
  "orderId": "ho-uuid",
  "scheduledAt": "2026-07-31T08:00:00.000Z",
  "status": "pending",
  "dose": "1 tablet"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Order `cancelled`/`completed` ise eklenemez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization-order.ts`
- Uygula: `POST /api/v1/clinic/hospitalization-orders/schedules/{scheduleId}/apply`
- Skip: `POST /api/v1/clinic/hospitalization-orders/schedules/{scheduleId}/skip`
- AI chunk: `flow-hospitalization-order`
- Audit event: `audit:hospitalization_order.schedule.add`
