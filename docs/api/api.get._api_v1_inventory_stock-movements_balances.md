# GET /api/v1/inventory/stock-movements/balances

Tenant-scoped stok bakiyeleri. Append-only ledger'dan atomik
olarak hesaplanır; saklanmaz (her çağrıda yeniden). `productId`
ve/veya `lotId` filtresi ile belirli bir ürün/lot bakiyesi.

- **Modül:** stock-movements
- **Yetki:** `inventory:stock_movement:read`
- **Audit:** yok (salt okunur)

**Query parametreleri:**

- `productId` (string) opsiyonel.
- `lotId` (string) opsiyonel.
- `warehouseId` (string) opsiyonel (Faz 7+'da raf
  filtrelemesi ile).

**Response 200 (`StockBalanceListResponse`):**

```json
GET /api/v1/inventory/stock-movements/balances?productId=prd-uuid
{
  "items": [
    {
      "productId": "prd-uuid",
      "lotId": "lot-uuid",
      "quantity": "95.00",
      "lastMovementAt": "2026-07-30T12:00:00.000Z"
    },
    {
      "productId": "prd-uuid",
      "lotId": null,
      "quantity": "5.00",
      "lastMovementAt": "2026-07-25T09:00:00.000Z"
    }
  ]
}
```

- `lotId=null` olan satır, lot belirtilmeden yapılan
  hareketlerin toplam bakiyesini gösterir.
- `quantity` her zaman ≥0 olabilir (negatif bakiye uyarısı
  Faz 7+'da).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.

**Hesaplama:** Append-only ledger'dan atomik toplam
(`Σ direction=in - Σ direction=out`). `reversal` tipindeki
hareketler de denkleştirilir. CROSS-tenant izolasyon
service'te.

**Tenant izolasyonu:** Sorgu tenant-scoped. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-movement.ts`
- Oluştur: `POST /api/v1/inventory/stock-movements`
- Liste: `GET /api/v1/inventory/stock-movements`
- AI chunk: `flow-stock-movement`
