# GET /api/v1/clinic/sales

Tenant-scoped klinik satış arama. `status`/`customerOwnerId`/
`patientId`/`sourceType`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** clinic-sales
- **Yetki:** `clinic:payment:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`ClinicSaleFilters`):**

- `status` (enum: `draft|completed|cancelled`) opsiyonel.
- `customerOwnerId` (string) opsiyonel.
- `patientId` (string) opsiyonel.
- `sourceType` (enum) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `minAmount`, `maxAmount` (Decimal) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`ClinicSaleListResponse`):**

```json
GET /api/v1/clinic/sales?status=completed&limit=20
{
  "items": [
    {
      "id": "cs-uuid",
      "customerOwnerId": "own-uuid",
      "patientId": "pat-uuid",
      "status": "completed",
      "currency": "TRY",
      "totalAmount": "200.00",
      "completedAt": "2026-07-30T13:00:00.000Z"
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENTAIN-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinic-sale.ts`
- Oluştur: `POST /api/v1/clinic/sales`
- Detay: `GET /api/v1/clinic/sales/{id}`
- AI chunk: `flow-clinic-sale`
