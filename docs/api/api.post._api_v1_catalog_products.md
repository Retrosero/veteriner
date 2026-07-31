# POST /api/v1/catalog/products

Klinik + petshop ortak kataloğa yeni ürün/hizmet ekler.
`ProductKind`: `stock_product` | `medicine` | `vaccine` |
`service` | `consumable`. SKU verilmediyse otomatik üretilir;
tenant içinde SKU ve barkod benzersizdir (arşivlenmiş kayıt
hariç).

- **Modül:** products
- **Yetki:** `catalog:product:create`
- **Audit:** `audit:product.create` (info)

**Request body (`ProductCreateInput`):**

```json
POST /api/v1/catalog/products
{
  "kind": "medicine",
  "name": "Amoksisilin 250 mg",
  "sku": "MED-AMX-250",
  "barcode": "8691234567890",
  "category": "Antibiyotik",
  "description": "Oral süspansiyon hazırlama için toz",
  "unit": "tablet",
  "taxProfile": "standard",
  "salePrice": "45.00",
  "costPrice": "30.00",
  "currency": "TRY",
  "saleAvailable": true,
  "purchaseTracked": true,
  "clinicUsage": true,
  "petshopUsage": false,
  "vaccineProtocolId": null,
  "minStockLevel": "10",
  "reorderLevel": "20"
}
```

- `kind` (enum) zorunlu.
- `name` (string, 1-200) zorunlu.
- `sku` (string, 1-64) opsiyonel; yoksa otomatik
  `PRD-<tenant8>-NNNNNN`.
- `barcode` (string, 1-32) opsiyonel; tenant içinde tekil.
- `category`, `description`, `manufacturer` opsiyonel.
- `unit` (enum, 11 değer) zorunlu.
- `taxProfile` (enum: `none|standard|reduced|zero|exempt`)
  zorunlu.
- `salePrice`, `costPrice` (Decimal string) opsiyonel;
  negatif olamaz.
- `currency` (ISO 4217) zorunlu.
- `saleAvailable` (bool, default `true`) — POS/reçete satışı.
- `purchaseTracked` (bool, default `true`) — tedarik takibi.
- `clinicUsage` (bool) + `petshopUsage` (bool) — kanal kısıtı.
- `vaccineProtocolId` (string|null) — yalnız `kind='vaccine'`
  için Faz 5 vaccine protokolüne referans (decoupled).
- `minStockLevel` / `reorderLevel` (Decimal string) opsiyonel.

**Response 201 (`Product`):**

```json
{
  "id": "prd-uuid",
  "tenantId": "tnt-uuid",
  "kind": "medicine",
  "name": "Amoksisilin 250 mg",
  "sku": "MED-AMX-250",
  "barcode": "8691234567890",
  "category": "Antibiyotik",
  "description": "...",
  "unit": "tablet",
  "taxProfile": "standard",
  "salePrice": "45.00",
  "costPrice": "30.00",
  "currency": "TRY",
  "saleAvailable": true,
  "purchaseTracked": true,
  "clinicUsage": true,
  "petshopUsage": false,
  "vaccineProtocolId": null,
  "minStockLevel": "10.00",
  "reorderLevel": "20.00",
  "archivedAt": null,
  "createdBy": "usr-uuid",
  "createdAt": "2026-07-30T12:00:00.000Z",
  "updatedAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası (Zod).
- `VET-VALIDATION-0010` (422) — Price/stock normalize
  hatası.
- `VET-PRODUCT-0002` (409) — Duplicate SKU veya barkod
  (arşivlenmemiş kayıt).

**Tenant izolasyonu:** SKU/barkod unique kontrolü tenant
scoped; başka tenant'la çakışmaz. SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/product.ts`
- Liste: `GET /api/v1/catalog/products`
- Detay: `GET /api/v1/catalog/products/{id}`
- Güncelle: `PATCH /api/v1/catalog/products/{id}`
- Arşivle: `POST /api/v1/catalog/products/{id}/archive`
- AI chunk: `flow-product-catalog`
- Audit event: `audit:product.create`
