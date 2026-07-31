# GET /api/v1/cash-register/sessions

Tenant-scoped kasa session listesi. `cashierId`/`status`/
`dateFrom`/`dateTo` filtreleri.

- **Modül:** cash-register
- **Yetki:** `cash_register:session:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`CashRegisterSessionFilters`):**

- `cashierId` (string) opsiyonel.
- `status` (enum: `open|closed`) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`CashRegisterSessionListResponse`):**

```json
GET /api/v1/cash-register/sessions?status=open
{
  "items": [
    {
      "id": "cr-uuid",
      "cashierId": "usr-uuid",
      "openingBalance": "500.00",
      "currency": "TRY",
      "status": "open",
      "openedAt": "2026-07-30T09:00:00.000Z"
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

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/cash-register.ts`
- Aç: `POST /api/v1/cash-register/sessions`
- Detay: `GET /api/v1/cash-register/sessions/{id}`
- AI chunk: `flow-cash-register`
