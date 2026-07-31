# POST /api/v1/inventory/purchase-orders

Yeni satın alma sipariş taslağı oluşturur (`status='draft'`).
Tedarikçi kataloğundan `supplierId` ile bağlanır; en az 1
satır zorunlu. Toplam (Decimal) otomatik hesaplanır
(`quantity × unitPrice` + KDV/vergi). Tedarikçi arşivliyse
422 `VET-PURCHASE_ORDER-0005`.

- **Modül:** purchase-orders
- **Yetki:** `inventory:purchase_order:create`
- **Audit:** `audit:purchase_order.create` (info)

**Request body (`PurchaseOrderCreateInput`):**

```json
POST /api/v1/inventory/purchase-orders
{
  "supplierId": "sup-uuid",
  "currency": "TRY",
  "expectedAt": "2026-08-15T00:00:00.000Z",
  "notes": "Aylık aşı siparişi",
  "lines": [
    {
      "productId": "prd-uuid",
      "quantity": "10",
      "unitPrice": "120.00"
    }
  ]
}
```

- `supplierId` (string) zorunlu.
- `currency` (ISO 4217) zorunlu.
- `expectedAt` (ISO datetime) opsiyonel.
- `notes` (string, ≤2000) opsiyonel.
- `lines` (array, min 1) zorunlu — her satır `productId` +
  `quantity` (Decimal) + `unitPrice` (Decimal).

**Response 201 (`PurchaseOrderDetail`):**

```json
{
  "id": "po-uuid",
  "tenantId": "tnt-uuid",
  "supplierId": "sup-uuid",
  "status": "draft",
  "currency": "TRY",
  "totalAmount": "1200.00",
  "expectedAt": "2026-08-15T00:00:00.000Z",
  "lines": [
    {
      "id": "pol-uuid",
      "productId": "prd-uuid",
      "quantity": "10",
      "unitPrice": "120.00",
      "lineTotal": "1200.00",
      "receivedQuantity": "0"
    }
  ],
  "createdAt": "2026-07-30T12:00:00.000Z",
  "createdBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PURCHASE_ORDER-0005` (422) — Tedarikçi bulunamadı
  veya arşivli.
- `VET-PURCHASE_ORDER-0007` (422) — Satır toplam/Decimal
  hesap hatası.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/purchase-order.ts`
- Liste: `GET /api/v1/inventory/purchase-orders`
- Detay: `GET /api/v1/inventory/purchase-orders/{id}`
- Güncelle: `PATCH /api/v1/inventory/purchase-orders/{id}`
- Onayla: `POST /api/v1/inventory/purchase-orders/{id}/approve`
- Kabul: `POST /api/v1/inventory/purchase-orders/{id}/receive`
- İptal: `POST /api/v1/inventory/purchase-orders/{id}/cancel`
- AI chunk: `flow-purchase-order`
- Audit event: `audit:purchase_order.create`
