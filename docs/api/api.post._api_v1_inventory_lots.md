# POST /api/v1/inventory/lots

Yeni lot (stok partisi) oluşturur. `lotNumber` `productId`
bazında tenant-içi benzersiz. SKT geçmiş olamaz (422
`VET-INV-0003`). Üretim tarihi SKT'den sonra olamaz.

- **Modül:** inventory
- **Yetki:** `inventory:lot:create`
- **Audit:** `audit:inventory.lot.create` (info)

**Request body (`StockLotCreateInput`):**

```json
POST /api/v1/inventory/lots
{
  "productId": "prd-uuid",
  "lotNumber": "LOT-2026-0001",
  "expiryDate": "2027-12-31T00:00:00.000Z",
  "manufacturedAt": "2026-06-01T00:00:00.000Z",
  "supplierName": "Nobivac",
  "shelfId": "sh-uuid",
  "quantity": "100",
  "notes": "Aşı partisi"
}
```

- `productId` (string) zorunlu (Product.id referansı).
- `lotNumber` (string, 1-100) zorunlu.
- `expiryDate` (ISO datetime) zorunlu; geçmiş olamaz.
- `manufacturedAt` (ISO datetime) opsiyonel; `expiryDate`'den
  önce olmalı.
- `receivedAt` (ISO datetime) opsiyonel, default `now`.
- `supplierName` (string, ≤200) opsiyonel.
- `shelfId` (string) opsiyonel.
- `quantity` (Decimal string) opsiyonel — başlangıç miktarı.
- `notes` (string, ≤2000) opsiyonel.

**Response 201 (`StockLot`):**

```json
{
  "id": "lot-uuid",
  "tenantId": "tnt-uuid",
  "productId": "prd-uuid",
  "lotNumber": "LOT-2026-0001",
  "expiryDate": "2027-12-31T00:00:00.000Z",
  "manufacturedAt": "2026-06-01T00:00:00.000Z",
  "receivedAt": "2026-07-30T12:00:00.000Z",
  "supplierName": "Nobivac",
  "shelfId": "sh-uuid",
  "quantity": "100",
  "notes": "Aşı partisi",
  "active": true,
  "createdAt": "2026-07-30T12:00:00.000Z",
  "createdBy": "usr-uuid",
  "archivedAt": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-INV-0003` (422) — SKT geçmiş veya manufactured >
  expiry.
- `VET-INV-0006` (409) — Aynı `lotNumber` bu ürün için zaten
  mevcut.

**Tenant izolasyonu:** `lotNumber` unique kontrolü
`productId` × tenant bazında. SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Liste: `GET /api/v1/inventory/lots`
- Detay: `GET /api/v1/inventory/lots/{id}`
- Güncelle: `PATCH /api/v1/inventory/lots/{id}`
- Arşivle: `POST /api/v1/inventory/lots/{id}/archive`
- AI chunk: `flow-inventory-lot`
- Audit event: `audit:inventory.lot.create`
