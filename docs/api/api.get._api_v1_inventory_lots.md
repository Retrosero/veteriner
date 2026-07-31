# GET /api/v1/inventory/lots

Tenant-scoped lot arama. `productId`/`shelfId`/`warehouseId`/
`expiredOnly`/`supplierName`/`lotNumber` filtreleri. SKT'ye
göre sıralanır (yaklaşan en önce).

- **Modül:** inventory
- **Yetki:** `inventory:lot:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`StockLotFilters`):**

- `productId` (string) opsiyonel.
- `shelfId` (string) opsiyonel.
- `warehouseId` (string) opsiyonel — raf üzerinden dolaylı.
- `expiredOnly` (boolean) opsiyonel — yalnız SKT geçmiş.
- `expiringWithinDays` (integer, 0-365) opsiyonel.
- `supplierName` (string, 1-200) opsiyonel — exact match.
- `lotNumber` (string, 1-100) opsiyonel.
- `active` (boolean) opsiyonel, default `true`.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`StockLotListResponse`):**

```json
GET /api/v1/inventory/lots?productId=prd-uuid&expiringWithinDays=30
{
  "items": [
    {
      "id": "lot-uuid",
      "productId": "prd-uuid",
      "lotNumber": "LOT-2026-0001",
      "expiryDate": "2026-08-15T00:00:00.000Z",
      "supplierName": "Nobivac",
      "shelfId": "sh-uuid",
      "quantity": "100",
      "active": true
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

**Sıralama:** Default `expiryDate ASC` (yaklaşan SKT en
önde). `expiredOnly=true` ile geçmiş lotlar üstte.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Oluştur: `POST /api/v1/inventory/lots`
- Detay: `GET /api/v1/inventory/lots/{id}`
- AI chunk: `flow-inventory-lot`
