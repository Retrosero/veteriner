# PATCH /api/v1/inventory/purchase-orders/{id}

Taslak sipariş kısmi güncelleme. Yalnız `status='draft'`
olanlar güncellenebilir; diğer durumlar → 409
`VET-PURCHASE_ORDER-0004`. Toplam otomatik yeniden hesaplanır.

- **Modül:** purchase-orders
- **Yetki:** `inventory:purchase_order:update`
- **Audit:** `audit:purchase_order.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`PurchaseOrderUpdateInput`):**

```json
PATCH /api/v1/inventory/purchase-orders/po-uuid
{
  "expectedAt": "2026-08-20T00:00:00.000Z",
  "lines": [
    {
      "productId": "prd-uuid",
      "quantity": "12",
      "unitPrice": "120.00"
    }
  ]
}
```

- `supplierId`, `currency`, `expectedAt`, `notes`, `lines`
  opsiyonel; en az bir alan.
- `lines` set edilirse mevcut satırlar komple değişir (delta
  değil, replace).

**Response 200 (`PurchaseOrderDetail`):**

`PurchaseOrderDetail` şeması için bkz.
`POST /api/v1/inventory/purchase-orders`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PURCHASE_ORDER-0001` (404) — Sipariş bulunamadı.
- `VET-PURCHASE_ORDER-0004` (409) — Yalnızca taslak
  güncellenebilir.
- `VET-PURCHASE_ORDER-0005` (422) — Tedarikçi uygun değil.
- `VET-PURCHASE_ORDER-0007` (422) — Satır toplam/Decimal
  hesap hatası.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before`+`after` snapshot; `lines` değişiminde
önceki/sonraki satır listesi payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/purchase-order.ts`
- Detay: `GET /api/v1/inventory/purchase-orders/{id}`
- AI chunk: `flow-purchase-order`
- Audit event: `audit:purchase_order.update`
