# GET /api/v1/pricing/lists/{id}/items

Fiyat listesi kalemlerini listeler. `productId`/`ownerId`/
`active` filtreleri. Default sıralama `productId ASC`.

- **Modül:** pricing
- **Yetki:** `pricing:price_list:read`
- **Audit:** yok (salt okunur)

**Query parametreleri:**

- `productId` (string) opsiyonel.
- `ownerId` (string|null) opsiyonel — müşteri-özel kalemler.
- `active` (boolean) opsiyonel, default `true`.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`PriceListItemListResponse`):**

```json
GET /api/v1/pricing/lists/pl-uuid/items
{
  "items": [
    {
      "id": "pli-uuid",
      "productId": "prd-uuid",
      "price": "150.00",
      "minQuantity": "1",
      "ownerId": null,
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
- `VET-PRICING-0001` (404) — Liste bulunamadı.

**Tenant izolasyonu:** Cross-tenant listId → 404. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Ekle: `POST /api/v1/pricing/lists/{id}/items`
- AI chunk: `flow-pricing`
