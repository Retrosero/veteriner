# POST /api/v1/inventory/stock-movements

Yeni stok hareketi kaydeder. Append-only ledger; bakiye
atomik olarak hesaplanır. `type`: `purchase` (PO receive'den
otomatik) | `sale` (POS satış) | `clinical_use` (muayene/
aşı/ameliyat) | `vaccination` (aşı uygulaması) | `return`
(iade) | `transfer` (çift-kayıt, kaynak/hedef) |
`count_adjustment` (sayım farkı) | `waste` (fire) |
`reversal` (mevcut hareketin tersi).

- **Modül:** stock-movements
- **Yetki:** `inventory:stock_movement:create`
- **Audit:** `audit:stock_movement.create` (info)

**Request body (`StockMovementCreateInput`):**

```json
POST /api/v1/inventory/stock-movements
{
  "productId": "prd-uuid",
  "lotId": "lot-uuid",
  "type": "count_adjustment",
  "direction": "out",
  "quantity": "5.00",
  "reason": "Sayım farkı",
  "sourceType": "manual",
  "sourceId": null,
  "notes": "Oda B'de 5 adet eksik"
}
```

- `productId` (string) zorunlu.
- `lotId` (string) opsiyonel; lot-scoped hareket için.
- `type` (enum) zorunlu; bazı türler için `reason` zorunlu
  (VET-STOCK-0007).
- `direction` (enum: `in|out`) zorunlu; `in` pozitif,
  `out` negatif etki.
- `quantity` (Decimal string, >0) zorunlu.
- `reason` (string) — `transfer` ve `count_adjustment`
  için zorunlu.
- `sourceType` + `sourceId` — `type='system'` veya otomatik
  hareketler için zorunlu (VET-STOCK-0012).
- `notes` (string) opsiyonel.

**Response 201 (`StockMovement`):**

```json
{
  "id": "sm-uuid",
  "tenantId": "tnt-uuid",
  "productId": "prd-uuid",
  "lotId": "lot-uuid",
  "type": "count_adjustment",
  "direction": "out",
  "quantity": "5.00",
  "balanceAfter": "95.00",
  "reason": "Sayım farkı",
  "sourceType": "manual",
  "sourceId": null,
  "reversalOfId": null,
  "createdAt": "2026-07-30T12:00:00.000Z",
  "createdBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-VALIDATION-0010` (422) — Quantity ≤0 veya normalize
  hatası.
- `VET-STOCK-0004` (404) — Ürün bulunamadı.
- `VET-STOCK-0005` (404) — Lot bulunamadı.
- `VET-STOCK-0006` (409) — Arşivlenmiş lot.
- `VET-STOCK-0007` (422) — `transfer`/`count_adjustment`
  için `reason` zorunlu.
- `VET-STOCK-0008` (409) — `kind='service'` ürün için stok
  hareketi oluşturulamaz.
- `VET-STOCK-0009` (409) — Arşivlenmiş ürün.
- `VET-STOCK-0011` (422) — Lot ile ürün eşleşmiyor.
- `VET-STOCK-0012` (422) — `type='system'` için
  `sourceType`/`sourceId` zorunlu.

**Tenant izolasyonu:** Tüm hareketler tenant-scoped.
SUPERADMIN bypass'lı.

**Append-only:** Hareket fiziksel silinmez; düzeltme için
`reversal` hareketi üretilir (POST /:id/reverse).

**Negatif bakiye:** Default kontrol YOK; `direction='out'`
ile yetersiz stok → negatif bakiye olabilir. Bu kural
Faz 7'de policy olarak eklenebilir (şu an uyarı).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-movement.ts`
- Liste: `GET /api/v1/inventory/stock-movements`
- Bakiye: `GET /api/v1/inventory/stock-movements/balances`
- Detay: `GET /api/v1/inventory/stock-movements/{id}`
- Ters kayıt: `POST /api/v1/inventory/stock-movements/{id}/reverse`
- AI chunk: `flow-stock-movement`
- Audit event: `audit:stock_movement.create`
