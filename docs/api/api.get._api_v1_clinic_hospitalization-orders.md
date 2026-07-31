# GET /api/v1/clinic/hospitalization-orders

Tenant-scoped yatış order arama. `status`/`type`/
`hospitalizationId`/`patientId`/`dateFrom`/`dateTo`
filtreleri.

- **Modül:** hospitalization-orders
- **Yetki:** `clinic:hospitalization:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`HospitalizationOrderFilters`):**

- `status` (enum: `active|completed|cancelled`) opsiyonel.
- `type` (enum) opsiyonel.
- `hospitalizationId` (string) opsiyonel.
- `patientId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`HospitalizationOrderListResponse`):**

```json
GET /api/v1/clinic/hospitalization-orders?hospitalizationId=hosp-uuid&status=active
{
  "items": [
    {
      "id": "ho-uuid",
      "hospitalizationId": "hosp-uuid",
      "patientId": "pat-uuid",
      "type": "medication",
      "name": "Amoksisilin 250 mg",
      "status": "active",
      "startAt": "2026-07-30T15:00:00.000Z"
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
- Oluştur: `POST /api/v1/clinic/hospitalization-orders`
- AI chunk: `flow-hospitalization-order`
