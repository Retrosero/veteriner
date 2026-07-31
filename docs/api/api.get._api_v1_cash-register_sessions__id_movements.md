# GET /api/v1/cash-register/sessions/{id}/movements

Kasa session'ı içindeki hareketler (tahsilat, ters kayıt,
manuel giriş/çıkış). `direction`/`sourceType`/`dateFrom`/
`dateTo` filtreleri.

- **Modül:** cash-register
- **Yetki:** `cash_register:movement:read`
- **Audit:** yok (salt okunur)

**Query parametreleri:**

- `direction` (enum: `in|out`) opsiyonel.
- `sourceType` (enum: `payment|payment_reversal|manual`)
  opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`CashRegisterMovementListResponse`):**

```json
GET /api/v1/cash-register/sessions/cr-uuid/movements
{
  "items": [
    {
      "id": "crm-uuid",
      "sessionId": "cr-uuid",
      "sourceType": "payment",
      "sourceId": "pay-uuid",
      "direction": "in",
      "amount": "200.00",
      "currency": "TRY",
      "occurredAt": "2026-07-30T13:00:00.000Z"
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
- `VET-CASH-0001` (404) — Session bulunamadı.

**Tenant izolasyonu:** Cross-tenant sessionId → 404.
SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/cash-register.ts`
- Detay: `GET /api/v1/cash-register/sessions/{id}`
- AI chunk: `flow-cash-register`
