# POST /api/v1/inventory/stock-alerts/low-stock/{productId}/acknowledge

Düşük stok uyarısını ack'ler. Bir ürün için yalnız 1 aktif
ack; mevcut ack korunur (idempotent). `acknowledgedAt` +
`acknowledgedBy` set edilir.

- **Modül:** stock-alerts
- **Yetki:** `inventory:stock_alert:acknowledge`
- **Audit:** `audit:stock_alert.low_stock.acknowledge` (info)

**Path parametreleri:**

- `productId` (UUID) zorunlu.

**Request body (`StockAlertAcknowledgeInput`):**

```json
POST /api/v1/inventory/stock-alerts/low-stock/prd-uuid/acknowledge
{
  "notes": "PO siparişi verildi"
}
```

- `notes` (string) opsiyonel.

**Response 200 (`StockAlert`):**

```json
{
  "id": "sa-uuid",
  "productId": "prd-uuid",
  "severity": "critical",
  "acknowledgedAt": "2026-07-30T16:00:00.000Z",
  "acknowledgedBy": "usr-uuid",
  "acknowledgeNotes": "PO siparişi verildi"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-STOCK-0004` (404) — Ürün bulunamadı.

**Tenant izolasyonu:** Cross-tenant productId → 404.
SUPERADMIN bypass'lı.

**Idempotency:** Mevcut `acknowledgedAt` korunur; tekrar
ack çağrısı 200 döner (mevcut ack + aynı notes veya yeni
notes).

**Audit detayı:** `firstAcknowledgedAt` (eğer yeniden ack)

- `lastAcknowledgedAt` + `lastAcknowledgedBy` +
  `acknowledgeNotes` payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-alert.ts`
- SKT ack: `POST /api/v1/inventory/stock-alerts/expiring-lots/{lotId}/acknowledge`
- AI chunk: `flow-stock-alert`
- Audit event: `audit:stock_alert.low_stock.acknowledge`
