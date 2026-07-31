# POST /api/v1/inventory/stock-alerts/expiring-lots/{lotId}/acknowledge

SKT lot uyarısını ack'ler. Bir lot için yalnız 1 aktif ack;
mevcut ack korunur (idempotent).

- **Modül:** stock-alerts
- **Yetki:** `inventory:stock_alert:acknowledge`
- **Audit:** `audit:stock_alert.expiring_lot.acknowledge` (info)

**Path parametreleri:**

- `lotId` (UUID) zorunlu.

**Request body (`StockAlertAcknowledgeInput`):**

```json
POST /api/v1/inventory/stock-alerts/expiring-lots/lot-uuid/acknowledge
{
  "notes": "İade edilecek"
}
```

- `notes` (string) opsiyonel.

**Response 200 (`StockAlert`):**

```json
{
  "id": "sa-uuid",
  "lotId": "lot-uuid",
  "severity": "expired",
  "acknowledgedAt": "2026-07-30T16:00:00.000Z",
  "acknowledgedBy": "usr-uuid",
  "acknowledgeNotes": "İade edilecek"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-STOCK-0005` (404) — Lot bulunamadı.

**Tenant izolasyonu:** Cross-tenant lotId → 404. SUPERADMIN
bypass'lı.

**Idempotency:** Mevcut `acknowledgedAt` korunur; tekrar
ack çağrısı 200 döner.

**Audit detayı:** `firstAcknowledgedAt` (eğer yeniden ack)
+ `lastAcknowledgedAt` + `acknowledgeNotes` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-alert.ts`
- Düşük stok ack: `POST /api/v1/inventory/stock-alerts/low-stock/{productId}/acknowledge`
- AI chunk: `flow-stock-alert`
- Audit event: `audit:stock_alert.expiring_lot.acknowledge`
