# POST /api/v1/pricing/lists/{id}/items/{itemId}/cancel

Fiyat listesi kalemini iptal eder (soft delete). `active=false`.
Geçmiş satış/fatura referansı korunur.

- **Modül:** pricing
- **Yetki:** `pricing:price_list:update`
- **Audit:** `audit:price_list_item.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.
- `itemId` (UUID) zorunlu.

**Request body (`PriceListItemCancelInput`):**

```json
POST /api/v1/pricing/lists/pl-uuid/items/pli-uuid/cancel
{
  "reason": "Ürün artık satılmıyor"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`PriceListItem`):**

`PriceListItem`; `cancelledAt`, `cancelledBy`,
`cancelReason` set edilir; `active=false`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PRICING-0001` (404) — Liste veya item bulunamadı.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `reason` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Detay: `GET /api/v1/pricing/lists/{id}/items`
- AI chunk: `flow-pricing`
- Audit event: `audit:price_list_item.cancel`
