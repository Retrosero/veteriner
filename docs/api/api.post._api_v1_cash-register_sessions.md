# POST /api/v1/cash-register/sessions

Yeni kasa session'ı açar. `openingBalance` (Decimal) +
`cashierId` (açan kişi) + opsiyonel `notes`. Aktif session
varsa → 409 `VET-CASH-0001`.

- **Modül:** cash-register
- **Yetki:** `cash_register:session:open`
- **Audit:** `audit:cash_register.session.open` (info)

**Request body (`CashRegisterSessionOpenInput`):**

```json
POST /api/v1/cash-register/sessions
{
  "cashierId": "usr-uuid",
  "openingBalance": "500.00",
  "currency": "TRY",
  "notes": "Sabah açılış"
}
```

- `cashierId` (string) zorunlu.
- `openingBalance` (Decimal, ≥0) zorunlu.
- `currency` (ISO 4217) zorunlu.
- `notes` (string) opsiyonel.

**Response 201 (`CashRegisterSession`):**

```json
{
  "id": "cr-uuid",
  "tenantId": "tnt-uuid",
  "cashierId": "usr-uuid",
  "openingBalance": "500.00",
  "closingBalance": null,
  "expectedBalance": null,
  "actualBalance": null,
  "difference": null,
  "currency": "TRY",
  "status": "open",
  "openedAt": "2026-07-30T09:00:00.000Z",
  "closedAt": null,
  "reopenedAt": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CASH-0001` (409) — Aktif session zaten var.
- `VET-VALIDATION-0010` (422) — Decimal hatası.

**Tenant izolasyonu:** Tüm CRUD tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/cash-register.ts`
- Liste: `GET /api/v1/cash-register/sessions`
- Aktif: `GET /api/v1/cash-register/sessions/current`
- Detay: `GET /api/v1/cash-register/sessions/{id}`
- Kapat: `POST /api/v1/cash-register/sessions/{id}/close`
- Yeniden aç: `POST /api/v1/cash-register/sessions/{id}/reopen`
- Hareketler: `GET /api/v1/cash-register/sessions/{id}/movements`
- Özet: `GET /api/v1/cash-register/sessions/{id}/summary`
- AI chunk: `flow-cash-register`
- Audit event: `audit:cash_register.session.open`
