# POST /api/v1/pricing/lists/{id}/items

Fiyat listesine yeni kalem (ürün × fiyat) ekler. Mevcut item
varsa duplicate → 409 `VET-PRICING-0005`; güncelleme için
`PATCH /:id/items/:itemId` kullanın.

- **Modül:** pricing
- **Yetki:** `pricing:price_list:update`
- **Audit:** `audit:price_list_item.create` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu — fiyat listesi id.

**Request body (`PriceListItemCreateInput`):**

```json
POST /api/v1/pricing/lists/pl-uuid/items
{
  "productId": "prd-uuid",
  "price": "150.00",
  "minQuantity": "1",
  "ownerId": null
}
```

- `productId` (string) zorunlu.
- `price` (Decimal, ≥0) zorunlu.
- `minQuantity` (Decimal, ≥1) opsiyonel, default `1`.
- `ownerId` (string|null) opsiyonel — müşteriye özel fiyat
  (kontrat müşteri).

**Response 201 (`PriceListItem`):**

```json
{
  "id": "pli-uuid",
  "listId": "pl-uuid",
  "productId": "prd-uuid",
  "price": "150.00",
  "minQuantity": "1",
  "ownerId": null,
  "active": true,
  "createdAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PRICING-0001` (404) — Liste bulunamadı.
- `VET-PRICING-0005` (409) — Aynı ürün için item zaten var.
- `VET-PRICING-0003` (409) — Arşivli listeye item
  eklenemez.

**Tenant izolasyonu:** Cross-tenant listId → 404. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Detay: `GET /api/v1/pricing/lists/{id}/items`
- Güncelle: `PATCH /api/v1/pricing/lists/{id}/items/{itemId}`
- İptal: `POST /api/v1/pricing/lists/{id}/items/{itemId}/cancel`
- AI chunk: `flow-pricing`
- Audit event: `audit:price_list_item.create`
