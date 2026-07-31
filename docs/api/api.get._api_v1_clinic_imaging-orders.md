# GET /api/v1/clinic/imaging-orders

Tenant-scoped görüntüleme arama. `status`/`modality`/
`patientId`/`priority`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`ImagingOrderFilters`):**

- `status` (enum: `ordered|scheduled|performed|reported|
  completed|cancelled`) opsiyonel.
- `modality` (enum) opsiyonel.
- `patientId` (string) opsiyonel.
- `priority` (enum) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`ImagingOrderListResponse`):**

```json
GET /api/v1/clinic/imaging-orders?status=ordered&modality=xray
{
  "items": [
    {
      "id": "io-uuid",
      "patientId": "pat-uuid",
      "modality": "xray",
      "bodyPart": "thorax",
      "status": "ordered",
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

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- Oluştur: `POST /api/v1/clinic/imaging-orders`
- AI chunk: `flow-imaging-order`
