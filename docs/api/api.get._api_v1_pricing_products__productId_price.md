# GET /api/v1/pricing/products/{productId}/price

Bir ürün için geçerli fiyatı çözümler. Müşteri-özel
(`ownerId` query) fiyat öncelikli; yoksa aktif listeden default
fiyat. `quantity` ile miktar-indirim kademeli fiyat da
destekler.

- **Modül:** pricing
- **Yetki:** `pricing:price_list:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `productId` (UUID) zorunlu.

**Query parametreleri:**

- `ownerId` (string|null) opsiyonel — müşteri-özel fiyat için.
- `quantity` (Decimal, ≥1) opsiyonel, default `1` — miktar
  kademeli fiyat.
- `at` (ISO datetime) opsiyonel, default `now` — bu tarihte
  geçerli liste.

**Response 200 (`ResolvedPrice`):**

```json
GET /api/v1/pricing/products/prd-uuid/price?quantity=5
{
  "productId": "prd-uuid",
  "price": "150.00",
  "currency": "TRY",
  "priceListId": "pl-uuid",
  "priceListItemId": "pli-uuid",
  "source": "standard",
  "ownerId": null,
  "quantity": "5",
  "minQuantity": "1"
}
```

- `source`: `standard` | `promotional` | `contract_owner` |
  `product_default` (ürün kataloğundaki default fiyat).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID veya query parse hatası.
- `VET-PRICING-0006` (404) — Ürün için fiyat bulunamadı.

**Çözümleme sırası (öncelik):**

1. `ownerId` set + aktif listede müşteri-özel item
   (`source='contract_owner'`).
2. `quantity >= minQuantity` olan aktif item
   (`source='standard'` veya `promotional'`).
3. `Product.salePrice` (ürün kataloğu default)
   (`source='product_default'`).

**Tenant izolasyonu:** Tüm liste + item sorguları
tenant-scoped; SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Liste: `GET /api/v1/pricing/lists`
- AI chunk: `flow-pricing`
