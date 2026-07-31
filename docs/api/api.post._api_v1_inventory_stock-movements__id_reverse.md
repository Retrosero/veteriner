# POST /api/v1/inventory/stock-movements/{id}/reverse

Mevcut bir stok hareketinin ters kaydını (`type='reversal'`)
oluşturur. Orijinal hareket korunur; bakiye ters kayıt
üzerinden denkleşir. Zaten ters kaydı olan hareket → 409
`VET-STOCK-0010`.

- **Modül:** stock-movements
- **Yetki:** `inventory:stock_movement:reverse` (yüksek yetki)
- **Audit:** `audit:stock_movement.reverse` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`StockMovementReverseInput`):**

```json
POST /api/v1/inventory/stock-movements/sm-uuid/reverse
{
  "reason": "Yanlış miktar girildi"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 201 (`StockMovement`):**

Yeni `StockMovement`; `type='reversal'`, `direction`
orijinalin tersi, `quantity` orijinal miktar,
`reversalOfId=orijinal hareket id`, `balanceAfter` yeni
bakiye.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-VALIDATION-0010` (422) — Quantity hesaplanamadı.
- `VET-STOCK-0001` (404) — Orijinal hareket bulunamadı.
- `VET-STOCK-0010` (409) — Bu hareketin zaten ters kaydı
  var (idempotent çift ters kayıt engellendi).

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Append-only garantisi:** Orijinal hareket korunur
(fiziksel silme YOK); `reversalOfId` ile bağlanır. Geçmiş
raporlar tutarlı kalır (atomik toplam hâlâ doğru).

**Audit detayı:** `reversedMovementId` + `newMovementId` +
`reason` payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-movement.ts`
- Detay: `GET /api/v1/inventory/stock-movements/{id}`
- AI chunk: `flow-stock-movement`
- Audit event: `audit:stock_movement.reverse`
