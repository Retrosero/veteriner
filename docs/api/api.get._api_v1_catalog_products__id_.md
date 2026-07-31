# GET /api/v1/catalog/products/{id}

ID'ye göre tek ürün getirir. Cross-tenant → 404
`VET-PRODUCT-0001`.

- **Modül:** products
- **Yetki:** `catalog:product:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`Product`):**

`Product` şeması için bkz. `POST /api/v1/catalog/products`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-PRODUCT-0001` (404) — Ürün bulunamadı (cross-tenant
  dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; service
`requireTenantScope` ile tenant doğrular. Cross-tenant id → null
(bilgi sızdırmaz). SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/product.ts`
- Liste: `GET /api/v1/catalog/products`
- Güncelle: `PATCH /api/v1/catalog/products/{id}`
- AI chunk: `flow-product-catalog`
