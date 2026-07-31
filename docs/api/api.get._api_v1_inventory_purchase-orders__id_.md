# GET /api/v1/inventory/purchase-orders/{id}

ID'ye göre satın alma sipariş detayı (lines dahil). Cross-tenant
→ 404 `VET-PURCHASE_ORDER-0001`.

- **Modül:** purchase-orders
- **Yetki:** `inventory:purchase_order:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`PurchaseOrderDetail`):**

`PurchaseOrderDetail` şeması için bkz.
`POST /api/v1/inventory/purchase-orders`; tüm `lines` dahil
(`id`, `productId`, `quantity`, `unitPrice`, `lineTotal`,
`receivedQuantity`, `lotId` opsiyonel).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-PURCHASE_ORDER-0001` (404) — Sipariş bulunamadı
  (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/purchase-order.ts`
- Liste: `GET /api/v1/inventory/purchase-orders`
- AI chunk: `flow-purchase-order`
