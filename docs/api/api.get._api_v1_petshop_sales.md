# GET /api/v1/petshop/sales

Tenant-scoped petshop satış arama. `status`/`customerOwnerId`/
`dateFrom`/`dateTo`/`cashierId` filtreleri.

- **Modül:** petshop-sales
- **Yetki:** `petshop:sale:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`PetshopSaleFilters`):**

- `status` (enum: `draft|completed|cancelled`) opsiyonel.
- `customerOwnerId` (string) opsiyonel.
- `cashierId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `minAmount`, `maxAmount` (Decimal string) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`PetshopSaleListResponse`):**

```json
GET /api/v1/petshop/sales?status=completed&limit=20
{
  "items": [
    {
      "id": "ps-uuid",
      "customerOwnerId": "own-uuid",
      "status": "completed",
      "currency": "TRY",
      "totalAmount": "300.00",
      "completedAt": "2026-07-30T13:00:00.000Z"
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

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale.ts`
- Oluştur: `POST /api/v1/petshop/sales`
- Detay: `GET /api/v1/petshop/sales/{id}`
- AI chunk: `flow-petshop-sale`
