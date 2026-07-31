# PATCH /api/v1/catalog/products/{id}

Ürün/hizmet kısmi güncelleme. Yalnız set edilen alanlar
değişir. Arşivli kayıt güncellenemez (409
`VET-PRODUCT-0004`). SKU/barkod değişirse unique kontrolü
yapılır.

- **Modül:** products
- **Yetki:** `catalog:product:update`
- **Audit:** `audit:product.update` (info); SKU/barkod
  değişiminde before/after payload'a eklenir.

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ProductUpdateInput`):**

```json
PATCH /api/v1/catalog/products/prd-uuid
{
  "salePrice": "50.00",
  "minStockLevel": "15"
}
```

- Tüm alanlar opsiyonel; en az bir alan set edilmeli.
- `name`, `category`, `description`, `manufacturer`, `unit`
  opsiyonel.
- `salePrice`, `costPrice` (Decimal string) opsiyonel;
  normalize → null hatasında 422 `VET-VALIDATION-0010`.
- `taxProfile` opsiyonel.
- `currency` opsiyonel.
- `saleAvailable`, `purchaseTracked`, `clinicUsage`,
  `petshopUsage` opsiyonel.
- `vaccineProtocolId` opsiyonel (string|null).
- `minStockLevel`, `reorderLevel` opsiyonel.
- `sku`, `barcode` opsiyonel; tenant içinde tekil olmalı
  (arşivlenmemiş kayıt).

**Response 200 (`Product`):**

`Product` şeması için bkz. `POST /api/v1/catalog/products`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID veya body parse hatası.
- `VET-VALIDATION-0010` (422) — Price/stock normalize hatası.
- `VET-PRODUCT-0001` (404) — Ürün bulunamadı.
- `VET-PRODUCT-0002` (409) — Yeni SKU/barkod başka aktif
  kayıtla çakışıyor.
- `VET-PRODUCT-0004` (409) — Arşivlenmiş kayıt güncellenemez.

**Tenant izolasyonu:** `actor.tenantId` zorunlu; service
`requireTenantScope` ile tenant doğrular. Cross-tenant id → 404.
SUPERADMIN bypass'lı.

**Audit detayı:**

- `before` + `after` snapshot payload'a eklenir.
- SKU/barkod değişiminde `skuChange`/`barcodeChange`:
  `{ before, after }`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/product.ts`
- Detay: `GET /api/v1/catalog/products/{id}`
- Arşivle: `POST /api/v1/catalog/products/{id}/archive`
- AI chunk: `flow-product-catalog`
- Audit event: `audit:product.update`
