# POST /api/v1/inventory/purchase-orders/{id}/cancel

Siparişi iptal eder. `status='draft'` veya `'approved'` veya
`'partial'` → `cancelled`. `received` veya zaten
`cancelled` → 409 `VET-PURCHASE_ORDER-0008`.

- **Modül:** purchase-orders
- **Yetki:** `inventory:purchase_order:cancel` (yüksek yetki)
- **Audit:** `audit:purchase_order.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`PurchaseOrderCancelInput`):**

```json
POST /api/v1/inventory/purchase-orders/po-uuid/cancel
{
  "reason": "Tedarikçi siparişi karşılayamıyor"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`PurchaseOrderDetail`):**

`PurchaseOrderDetail`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PURCHASE_ORDER-0001` (404) — Sipariş bulunamadı.
- `VET-PURCHASE_ORDER-0008` (409) — Bu durumdaki sipariş
  iptal edilemez (`received` veya zaten `cancelled`).

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Stok etkisi:** İptal edilen siparişten kabul edilen
miktarlar (kısmi receive sonrası cancel) için ters kayıt
**otomatik üretilmez**; gerekirse manuel `StockMovement`
(`type='reversal'`) ile düzeltilir. Audit trail korunur.

**Audit detayı:** `reason` + `previousStatus` + alınan
toplam miktar (kısmi receive sonrası ise) payload'a
eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/purchase-order.ts`
- Detay: `GET /api/v1/inventory/purchase-orders/{id}`
- AI chunk: `flow-purchase-order`
- Audit event: `audit:purchase_order.cancel`
