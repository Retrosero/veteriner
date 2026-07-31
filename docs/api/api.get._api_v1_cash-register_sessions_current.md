# GET /api/v1/cash-register/sessions/current

Açık (henüz kapatılmamış) kasa session'ını getirir. Hiç açık
session yoksa → 404.

- **Modül:** cash-register
- **Yetki:** `cash_register:session:read`
- **Audit:** yok (salt okunur)

**Response 200 (`CashRegisterSession`):**

`CashRegisterSession` şeması için bkz.
`POST /api/v1/cash-register/sessions`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CASH-0001` (404) — Açık session yok.

**Tenant izolasyonu:** Tenant-scoped tek aktif session;
SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/cash-register.ts`
- Aç: `POST /api/v1/cash-register/sessions`
- AI chunk: `flow-cash-register`
