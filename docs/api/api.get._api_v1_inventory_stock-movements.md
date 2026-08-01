# GET /api/v1/inventory/stock-movements

Tenant-scoped stok hareketi arama. `productId`/`lotId`/
`type`/`direction`/`sourceType`/`dateFrom`/`dateTo`
filtreleri. Default sıralama `createdAt DESC`.

- **Modül:** stock-movements
- **Yetki:** `inventory:stock_movement:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`StockMovementFilters`):**

- `productId` (string) opsiyonel.
- `lotId` (string) opsiyonel.
- `type` (enum: `purchase|sale|clinical_use|vaccination|
return|transfer|count_adjustment|waste|reversal`) opsiyonel.
- `direction` (enum: `in|out`) opsiyonel.
- `sourceType` (enum: `manual|purchase_order|sale|
examination|vaccine_application|return|transfer`) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`StockMovementListResponse`):**

```json
GET /api/v1/inventory/stock-movements?productId=prd-uuid&limit=20
{
  "items": [
    {
      "id": "sm-uuid",
      "productId": "prd-uuid",
      "lotId": "lot-uuid",
      "type": "purchase",
      "direction": "in",
      "quantity": "10.00",
      "balanceAfter": "100.00",
      "sourceType": "purchase_order",
      "sourceId": "po-uuid",
      "createdAt": "2026-07-30T12:00:00.000Z"
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

**Tenant izolasyonu:** Tüm sorgular tenant-scoped. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-movement.ts`
- Oluştur: `POST /api/v1/inventory/stock-movements`
- Bakiye: `GET /api/v1/inventory/stock-movements/balances`
- Detay: `GET /api/v1/inventory/stock-movements/{id}`
- AI chunk: `flow-stock-movement`
