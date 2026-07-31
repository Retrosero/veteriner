# GET /api/v1/inventory/stock-alerts/low-stock

Tenant-scoped düşük stok uyarıları. Ürünün
`reorderLevel`/`minStockLevel` altına düşen veya qty≤0 olan
kayıtlar. Severity: `warning` (`qty > 0` ve `<=reorder`),
`critical` (`qty <= min` veya `qty <= 0`).

- **Modül:** stock-alerts
- **Yetki:** `inventory:stock_alert:read`
- **Audit:** yok (salt okunur)

**Query parametreleri:**

- `severity` (enum: `warning|critical`) opsiyonel.
- `productId` (string) opsiyonel.
- `category` (string) opsiyonel.
- `acknowledged` (boolean) opsiyonel — false: yalnız ack
  edilmemiş (default), true: yalnız ack edilmiş.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200:**

```json
GET /api/v1/inventory/stock-alerts/low-stock?severity=critical
{
  "items": [
    {
      "id": "sa-uuid",
      "productId": "prd-uuid",
      "productName": "Amoksisilin 250 mg",
      "currentQuantity": "0",
      "reorderLevel": "20",
      "minStockLevel": "10",
      "severity": "critical",
      "acknowledgedAt": null,
      "acknowledgedBy": null
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**Hesaplama:** `StockMovement` ledger'ından atomik bakiye
(`GET /stock-movements/balances`) + Product
`reorderLevel`/`minStockLevel`. Sorgu anında hesaplanır;
cache'lenmez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-alert.ts`
- SKT: `GET /api/v1/inventory/stock-alerts/expiring-lots`
- Yenile: `POST /api/v1/inventory/stock-alerts/refresh`
- Özet: `GET /api/v1/inventory/stock-alerts/summary`
- Ack: `POST /api/v1/inventory/stock-alerts/low-stock/{productId}/acknowledge`
- AI chunk: `flow-stock-alert`
