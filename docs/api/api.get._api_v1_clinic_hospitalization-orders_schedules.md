# GET /api/v1/clinic/hospitalization-orders/schedules

Tüm schedule'ları listeler (cross-order). `status`/`orderId`/
`patientId`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** hospitalization-orders
- **Yetki:** `clinic:hospitalization:read`
- **Audit:** yok (salt okunur)

**Query parametreleri:**

- `status` (enum: `pending|applied|skipped`) opsiyonel.
- `orderId` (string) opsiyonel.
- `patientId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`HospitalizationOrderScheduleListResponse`):**

```json
GET /api/v1/clinic/hospitalization-orders/schedules?status=pending
{
  "items": [
    {
      "id": "hos-uuid",
      "orderId": "ho-uuid",
      "patientId": "pat-uuid",
      "scheduledAt": "2026-07-31T08:00:00.000Z",
      "status": "pending",
      "dose": "1 tablet"
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization-order.ts`
- AI chunk: `flow-hospitalization-order`
