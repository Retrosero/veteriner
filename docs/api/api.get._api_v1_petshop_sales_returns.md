# GET /api/v1/petshop/sales/returns

Tenant-scoped petshop satış iade arama. `status`/
`originalSaleId`/`cashierId`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** petshop-sale-returns
- **Yetki:** `petshop:sale:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`PetshopSaleReturnFilters`):**

- `status` (enum: `draft|completed|cancelled`) opsiyonel.
- `originalSaleId` (string) opsiyonel — belirli bir satışa
  bağlı iadeler.
- `cashierId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `minRefund`, `maxRefund` (Decimal string) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`PetshopSaleReturnListResponse`):**

```json
GET /api/v1/petshop/sales/returns?status=completed&limit=20
{
  "items": [
    {
      "id": "psr-uuid",
      "originalSaleId": "ps-uuid",
      "status": "completed",
      "totalRefund": "150.00",
      "completedAt": "2026-07-30T15:00:00.000Z"
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

- API sözleşmesi: `packages/contracts/src/petshop-sale-return.ts`
- Oluştur: `POST /api/v1/petshop/sales/returns`
- Detay: `GET /api/v1/petshop/sales/returns/{id}`
- AI chunk: `flow-petshop-sale-return`
