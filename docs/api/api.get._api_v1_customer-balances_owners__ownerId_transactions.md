# GET /api/v1/customer-balances/owners/{ownerId}/transactions

Hasta sahibinin bakiye hareketleri (borç/alacak
transaction). Sıralı tarih DESC. `direction`/`sourceType`/
`dateFrom`/`dateTo` filtreleri.

- **Modül:** customer-balances
- **Yetki:** `clinic:payment:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `ownerId` (UUID) zorunlu.

**Query parametreleri (`CustomerBalanceTransactionFilters`):**

- `direction` (enum: `debit|credit`) opsiyonel.
- `sourceType` (enum: `clinic_sale|petshop_sale|return_credit|
payment|payment_reversal|manual_adjustment`) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`CustomerBalanceTransactionListResponse`):**

```json
GET /api/v1/customer-balances/owners/own-uuid/transactions
{
  "items": [
    {
      "id": "cbt-uuid",
      "ownerId": "own-uuid",
      "direction": "debit",
      "sourceType": "clinic_sale",
      "sourceId": "cs-uuid",
      "amount": "200.00",
      "currency": "TRY",
      "balanceAfter": "300.00",
      "occurredAt": "2026-07-30T13:00:00.000Z"
    },
    {
      "id": "cbt-uuid-2",
      "direction": "credit",
      "sourceType": "return_credit",
      "sourceId": "psr-uuid",
      "amount": "100.00",
      "balanceAfter": "200.00",
      "occurredAt": "2026-07-30T14:00:00.000Z"
    }
  ],
  "total": 2
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID veya query parse hatası.
- (404) — Owner bulunamadı.

**Tenant izolasyonu:** Cross-tenant ownerId → 404. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/customer-balance.ts`
- Bakiye: `GET /api/v1/customer-balances/owners/{ownerId}`
- AI chunk: `flow-customer-balance`
