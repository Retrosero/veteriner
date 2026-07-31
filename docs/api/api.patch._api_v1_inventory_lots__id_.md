# PATCH /api/v1/inventory/lots/{id}

Lot kısmi güncelleme. Arşivli → 409 (güncellenemez).
`lotNumber` değişirse `productId` × tenant unique kontrolü.
SKT/üretim tarihi tutarlılığı kontrol edilir.

- **Modül:** inventory
- **Yetki:** `inventory:lot:update`
- **Audit:** `audit:inventory.lot.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`StockLotUpdateInput`):**

```json
PATCH /api/v1/inventory/lots/lot-uuid
{
  "shelfId": "sh-uuid-2",
  "notes": "Yeni raf atandı"
}
```

- Tüm alanlar opsiyonel; en az bir alan set edilmeli.
- `lotNumber`, `expiryDate`, `manufacturedAt`, `receivedAt`,
  `supplierName`, `shelfId`, `quantity`, `notes`, `active`.

**Response 200 (`StockLot`):**

`StockLot` şeması için bkz. `POST /api/v1/inventory/lots`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-INV-0003` (404) — Lot bulunamadı.
- `VET-INV-0006` (409) — Yeni `lotNumber` bu ürün için zaten
  mevcut.
- `VET-INV-0009` (409) — Arşivlenmiş kayıt güncellenemez.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before` + `after` snapshot; `lotNumber`
veya `shelfId` değişiminde before/after.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Detay: `GET /api/v1/inventory/lots/{id}`
- AI chunk: `flow-inventory-lot`
- Audit event: `audit:inventory.lot.update`
