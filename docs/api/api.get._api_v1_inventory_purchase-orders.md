# GET /api/v1/inventory/purchase-orders

Tenant-scoped satın alma sipariş arama. `supplierId`/
`status`/`currency`/`dateFrom`/`dateTo` filtreleri. Default
sıralama `createdAt DESC`.

- **Modül:** purchase-orders
- **Yetki:** `inventory:purchase_order:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`PurchaseOrderFilters`):**

- `supplierId` (string) opsiyonel.
- `status` (enum: `draft|approved|partial|received|cancelled`)
  opsiyonel.
- `currency` (ISO 4217) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `search` (string, 1-100) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`PurchaseOrderListResponse`):**

```json
GET /api/v1/inventory/purchase-orders?status=draft&limit=20
{
  "items": [
    {
      "id": "po-uuid",
      "supplierId": "sup-uuid",
      "status": "draft",
      "currency": "TRY",
      "totalAmount": "1200.00",
      "expectedAt": "2026-08-15T00:00:00.000Z",
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

- API sözleşmesi: `packages/contracts/src/purchase-order.ts`
- Oluştur: `POST /api/v1/inventory/purchase-orders`
- Detay: `GET /api/v1/inventory/purchase-orders/{id}`
- AI chunk: `flow-purchase-order`
