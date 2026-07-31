# GET /api/v1/inventory/stock-alerts/summary

Uyarı özeti (dashboard kartı için). Severity × tip
(low-stock / expiring-lots / expired) matrisi. Frontend
kartları için kompakt.

- **Modül:** stock-alerts
- **Yetki:** `inventory:stock_alert:read`
- **Audit:** yok (salt okunur)

**Response 200 (`StockAlertSummary`):**

```json
GET /api/v1/inventory/stock-alerts/summary
{
  "lowStock": {
    "warning": 5,
    "critical": 2
  },
  "expiringLots": {
    "warning": 3,
    "critical": 1,
    "expired": 1
  },
  "totalUnacknowledged": 12,
  "generatedAt": "2026-07-30T16:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.

**Tenant izolasyonu:** Tüm hesaplama tenant-scoped;
SUPERADMIN bypass'lı.

**Kullanım:** Faz 8 dashboard için kart kaynağı; reaktif
hook'lar ile canlı güncelleme.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-alert.ts`
- Liste: `GET /api/v1/inventory/stock-alerts/low-stock`
- SKT: `GET /api/v1/inventory/stock-alerts/expiring-lots`
- Yenile: `POST /api/v1/inventory/stock-alerts/refresh`
- AI chunk: `flow-stock-alert`
