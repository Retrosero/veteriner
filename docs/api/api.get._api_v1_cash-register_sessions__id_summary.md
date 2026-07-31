# GET /api/v1/cash-register/sessions/{id}/summary

Kasa session'ı özeti: opening + in - out = expected
balance; hareket sayısı; gerçek bakiye (kapanıştan sonra
`actualBalance` ve `difference`).

- **Modül:** cash-register
- **Yetki:** `cash_register:session:read`
- **Audit:** yok (salt okunur)

**Response 200 (`CashRegisterSessionSummary`):**

```json
GET /api/v1/cash-register/sessions/cr-uuid/summary
{
  "sessionId": "cr-uuid",
  "openingBalance": "500.00",
  "totalIn": "1200.00",
  "totalOut": "200.00",
  "expectedBalance": "1500.00",
  "actualBalance": "1480.00",
  "difference": "-20.00",
  "currency": "TRY",
  "movementCount": 8,
  "status": "closed"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CASH-0001` (404) — Session bulunamadı.

**Hesaplama:**

- `expectedBalance = openingBalance + totalIn - totalOut`.
- `actualBalance` yalnız kapatılmış session'lar için set
  edilir; açık session'lar `null`.
- `difference = actualBalance - expectedBalance` (negatif =
  kasa açığı).

**Tenant izolasyonu:** Cross-tenant sessionId → 404.
SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/cash-register.ts`
- Hareketler: `GET /api/v1/cash-register/sessions/{id}/movements`
- AI chunk: `flow-cash-register`
