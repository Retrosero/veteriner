# GET /api/v1/inventory/stock-alerts/expiring-lots

Tenant-scoped SKT yaklaşan/geçmiş lot uyarıları. Severity:
`warning` (8-30 gün), `critical` (1-7 gün), `expired` (≤0
gün).

- **Modül:** stock-alerts
- **Yetki:** `inventory:stock_alert:read`
- **Audit:** yok (salt okunur)

**Query parametreleri:**

- `severity` (enum: `warning|critical|expired`) opsiyonel.
- `productId` (string) opsiyonel.
- `warehouseId` (string) opsiyonel.
- `acknowledged` (boolean) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200:**

```json
GET /api/v1/inventory/stock-alerts/expiring-lots?severity=expired
{
  "items": [
    {
      "id": "sa-uuid",
      "lotId": "lot-uuid",
      "productId": "prd-uuid",
      "productName": "Aşı X",
      "lotNumber": "LOT-2026-0001",
      "expiryDate": "2026-07-20T00:00:00.000Z",
      "daysUntilExpiry": -10,
      "severity": "expired",
      "acknowledgedAt": null
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

**Severity eşikleri:**

- `expired` — `daysUntilExpiry <= 0` (SKT geçmiş).
- `critical` — `1 <= daysUntilExpiry <= 7`.
- `warning` — `8 <= daysUntilExpiry <= 30`.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-alert.ts`
- Düşük stok: `GET /api/v1/inventory/stock-alerts/low-stock`
- Yenile: `POST /api/v1/inventory/stock-alerts/refresh`
- Ack: `POST /api/v1/inventory/stock-alerts/expiring-lots/{lotId}/acknowledge`
- AI chunk: `flow-stock-alert`
