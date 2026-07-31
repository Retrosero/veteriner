# POST /api/v1/inventory/purchase-orders/{id}/approve

Taslak siparişi onaylar. `status='draft'` → `status='approved'`.
Onay sonrası tedarikçiye gönderilebilir; `receive` ile
kabul yapılır.

- **Modül:** purchase-orders
- **Yetki:** `inventory:purchase_order:approve` (yüksek yetki)
- **Audit:** `audit:purchase_order.approve` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ notes?: string }`).

**Response 200 (`PurchaseOrderDetail`):**

`PurchaseOrderDetail`; `status='approved'`, `approvedAt`,
`approvedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-PURCHASE_ORDER-0001` (404) — Sipariş bulunamadı.
- `VET-PURCHASE_ORDER-0002` (409) — Yalnızca taslak
  onaylanabilir.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before` (status=draft) + `after`
(status=approved). Opsiyonel `notes` payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/purchase-order.ts`
- Detay: `GET /api/v1/inventory/purchase-orders/{id}`
- Kabul: `POST /api/v1/inventory/purchase-orders/{id}/receive`
- AI chunk: `flow-purchase-order`
- Audit event: `audit:purchase_order.approve`
