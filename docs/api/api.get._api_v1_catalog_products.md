# GET /api/v1/catalog/products

Tenant-scoped ürün/hizmet arama + sayfalama. `kind`/`kinds`/
`clinic`/`petshop`/`search`/`category`/`active` filtreleri
destekler. Arşivlenmiş (`archivedAt != null`) kayıtlar
**dönmez**.

- **Modül:** products
- **Yetki:** `catalog:product:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`ProductFilters`):**

- `kind` (enum) opsiyonel — tek tür.
- `kinds` (enum[]) opsiyonel — birden çok tür (CSV veya
  tekrarlı).
- `clinic` (boolean) opsiyonel — `clinicUsage=true` olanlar.
- `petshop` (boolean) opsiyonel — `petshopUsage=true` olanlar.
- `category` (string, 1-100) opsiyonel — exact match.
- `search` (string, 1-100) opsiyonel — `name`/`sku`/`barcode`
  case-insensitive contains.
- `active` (boolean, default `true`) — arşivlenmemiş kayıtlar.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, ≥0, default 0).
- `sort` (enum: `name|createdAt|updatedAt|salePrice`,
  default `name`).
- `order` (enum: `asc|desc`, default `asc`).

**Response 200 (`ProductListResponse`):**

```json
GET /api/v1/catalog/products?kind=medicine&clinic=true&limit=20
{
  "items": [
    {
      "id": "prd-uuid",
      "tenantId": "tnt-uuid",
      "kind": "medicine",
      "name": "Amoksisilin 250 mg",
      "sku": "MED-AMX-250",
      "barcode": "8691234567890",
      "unit": "tablet",
      "taxProfile": "standard",
      "salePrice": "45.00",
      "currency": "TRY",
      "saleAvailable": true,
      "clinicUsage": true,
      "petshopUsage": false,
      "archivedAt": null,
      "createdAt": "2026-07-30T12:00:00.000Z",
      "updatedAt": "2026-07-30T12:00:00.000Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası (Zod).

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/product.ts`
- Oluştur: `POST /api/v1/catalog/products`
- Detay: `GET /api/v1/catalog/products/{id}`
- AI chunk: `flow-product-catalog`
