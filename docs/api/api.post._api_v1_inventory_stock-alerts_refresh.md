# POST /api/v1/inventory/stock-alerts/refresh

Uyarı listesini yeniden hesaplar. Düşük stok + SKT lot
uyarılarını taze hesaplar, ack durumlarını korur (idempotent).
Cron/manuel tetikleme için.

- **Modül:** stock-alerts
- **Yetki:** `inventory:stock_alert:read`
- **Audit:** `audit:stock_alert.refresh` (info)

**Request body:** opsiyonel (`{ productId?: string }` —
yalnız tek ürün için yeniden hesap).

**Response 200:**

```json
{
  "lowStockCount": 5,
  "expiringLotsCount": 3,
  "expiredLotsCount": 1,
  "refreshedAt": "2026-07-30T16:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.

**Tenant izolasyonu:** Tüm hesaplama tenant-scoped;
SUPERADMIN bypass'lı.

**Idempotency:** ack edilmiş uyarılar korunur; aynı ürün/
lot için tekrar ack gönderilmesine gerek yok.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-alert.ts`
- Düşük stok: `GET /api/v1/inventory/stock-alerts/low-stock`
- SKT: `GET /api/v1/inventory/stock-alerts/expiring-lots`
- AI chunk: `flow-stock-alert`
- Audit event: `audit:stock_alert.refresh`
