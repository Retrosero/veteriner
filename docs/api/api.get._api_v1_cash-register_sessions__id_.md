# GET /api/v1/cash-register/sessions/{id}

ID'ye göre kasa session detayı. Cross-tenant → 404.

- **Modül:** cash-register
- **Yetki:** `cash_register:session:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`CashRegisterSession`):**

`CashRegisterSession` şeması için bkz.
`POST /api/v1/cash-register/sessions`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-CASH-0001` (404) — Session bulunamadı
  (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/cash-register.ts`
- Liste: `GET /api/v1/cash-register/sessions`
- AI chunk: `flow-cash-register`
