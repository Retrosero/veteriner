# GET /api/v1/clinic/lab-orders

Tenant-scoped lab order arama. `status`/`patientId`/
`labTestId`/`priority`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** lab-orders
- **Yetki:** `clinic:lab:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`LabOrderFilters`):**

- `status` (enum: `ordered|sample_collected|in_progress|
  completed|cancelled`) opsiyonel.
- `patientId` (string) opsiyonel.
- `labTestId` (string) opsiyonel.
- `priority` (enum) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`LabOrderListResponse`):**

```json
GET /api/v1/clinic/lab-orders?status=in_progress&priority=urgent
{
  "items": [
    {
      "id": "lo-uuid",
      "patientId": "pat-uuid",
      "labTestId": "lt-uuid",
      "priority": "urgent",
      "status": "in_progress",
      "orderedAt": "2026-07-30T12:00:00.000Z"
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

- API sözleşmesi: `packages/contracts/src/lab-order.ts`
- Oluştur: `POST /api/v1/clinic/lab-orders`
- AI chunk: `flow-lab-order`
