# POST /api/v1/inventory/purchase-orders/{id}/receive

Onaylı siparişten mal kabulü yapar. Her satır için
`receivedQuantity` (Decimal) gönderilir; bu değer PO satır
miktarını aşamaz. `status` akışı: `approved` → `partial`
(kısmi kabul) veya `received` (tam kabul). Kabul edilen
miktarlar `StockMovement` (GOAL-063) `type='purchase'` ile
stok bakiyesine eklenir ve `lotId` referansı ile lot/SKT
bilgisi kaydedilir.

- **Modül:** purchase-orders
- **Yetki:** `inventory:purchase_order:receive` (yüksek yetki)
- **Audit:** `audit:purchase_order.receive` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`PurchaseOrderReceiveInput`):**

```json
POST /api/v1/inventory/purchase-orders/po-uuid/receive
{
  "lines": [
    {
      "lineId": "pol-uuid",
      "receivedQuantity": "10",
      "lotId": "lot-uuid"
    }
  ],
  "notes": "Tam kabul"
}
```

- `lines` (array, min 1) zorunlu.
- Her satırda `lineId` (PO satır id), `receivedQuantity`
  (Decimal ≤ sipariş miktarı), `lotId` (GOAL-061 lot
  referansı, opsiyonel ama önerilir).
- `notes` opsiyonel.

**Response 200 (`PurchaseOrderDetail`):**

`PurchaseOrderDetail`; `status='received'` (tam) veya
`status='partial'` (kısmi), `receivedAt`, `receivedBy`
set edilir. `lines[].receivedQuantity` güncellenir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PURCHASE_ORDER-0001` (404) — Sipariş bulunamadı.
- `VET-PURCHASE_ORDER-0002` (409) — Yalnızca onaylı/kısmi
  kabul edilebilir.
- `VET-PURCHASE_ORDER-0007` (422) — Geçersiz miktar
  (≤0 veya sipariş miktarını aşan).

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Stock Entegrasyonu (GOAL-063):**

- `receivedQuantity > 0` olan her satır için bir
  `StockMovement` (`type='purchase'`) üretilir.
- `lotId` set edilmişse lot referansı bağlanır; bu sayede
  SKT/raf takibi korunur.
- Bakiye atomik olarak artırılır (in-memory'de senkronize).

**Audit detayı:** `lines[]` before/after `receivedQuantity`

- `newMovementIds[]` payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/purchase-order.ts`
- Detay: `GET /api/v1/inventory/purchase-orders/{id}`
- Stok hareketi: `flow-stock-movement`
- AI chunk: `flow-purchase-order`
- Audit event: `audit:purchase_order.receive`
