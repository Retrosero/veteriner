# POST /api/v1/cash-register/sessions/{id}/reopen

Kapatılmış kasa session'ı yeniden açar (düzeltme için).
`status='closed'` → `status='open'`. `reopenedAt` set edilir.
Aynı anda açık başka session varsa → 409.

- **Modül:** cash-register
- **Yetki:** `cash_register:session:reopen` (yüksek yetki)
- **Audit:** `audit:cash_register.session.reopen` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`CashRegisterSessionReopenInput`):**

```json
POST /api/v1/cash-register/sessions/cr-uuid/reopen
{
  "reason": "Sayım farkı düzeltme"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`CashRegisterSession`):**

`CashRegisterSession`; `status='open'`, `reopenedAt`,
`reopenedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CASH-0001` (404) — Session bulunamadı.
- `VET-CASH-0002` (409) — Zaten açık.
- `VET-CASH-0001` (409) — Başka açık session var.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `reason` + `previousStatus` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/cash-register.ts`
- Detay: `GET /api/v1/cash-register/sessions/{id}`
- AI chunk: `flow-cash-register`
- Audit event: `audit:cash_register.session.reopen`
