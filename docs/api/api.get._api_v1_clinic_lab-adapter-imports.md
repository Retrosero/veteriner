# GET /api/v1/clinic/lab-adapter-imports

Tenant-scoped import arama. `labOrderId`/`adapterId`/
`status`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** lab-adapters
- **Yetki:** `clinic:lab:read`
- **Audit:** yok (salt okunur)

**Query parametreleri:**

- `labOrderId` (string) opsiyonel.
- `adapterId` (string) opsiyonel.
- `status` (enum) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`LabAdapterImportListResponse`):**

```json
GET /api/v1/clinic/lab-adapter-imports?status=completed
{
  "items": [
    {
      "id": "lai-uuid",
      "labOrderId": "lo-uuid",
      "adapterId": "adapter-uuid",
      "format": "hl7",
      "status": "completed",
      "externalReference": "EXT-2026-0001",
      "processedAt": "2026-07-30T16:00:00.000Z"
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

- API sözleşmesi: `packages/contracts/src/lab-adapter.ts`
- Oluştur: `POST .../lab-orders/{labOrderId}/adapter-imports`
- AI chunk: `flow-lab-adapter`
