# PATCH /api/v1/pricing/lists/{id}/items/{itemId}

Fiyat listesi kalemi kısmi güncelleme. Yalnız aktif item
güncellenebilir.

- **Modül:** pricing
- **Yetki:** `pricing:price_list:update`
- **Audit:** `audit:price_list_item.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu — fiyat listesi id.
- `itemId` (UUID) zorunlu — kalem id.

**Request body (`PriceListItemUpdateInput`):**

```json
PATCH /api/v1/pricing/lists/pl-uuid/items/pli-uuid
{
  "price": "160.00",
  "minQuantity": "2"
}
```

- `price`, `minQuantity`, `ownerId`, `active` opsiyonel;
  en az bir alan.

**Response 200 (`PriceListItem`):**

`PriceListItem` şeması için bkz.
`POST /api/v1/pricing/lists/{id}/items`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PRICING-0001` (404) — Liste veya item bulunamadı.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before`+`after` snapshot.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- İptal: `POST /api/v1/pricing/lists/{id}/items/{itemId}/cancel`
- AI chunk: `flow-pricing`
- Audit event: `audit:price_list_item.update`
