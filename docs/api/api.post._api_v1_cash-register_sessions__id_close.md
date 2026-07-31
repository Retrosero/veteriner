# POST /api/v1/cash-register/sessions/{id}/close

Kasa session'ı kapatır (`status='open'` → `status='closed'`).
`actualBalance` (gerçek sayım) zorunlu; `expectedBalance`
otomatik hesaplanır; `difference` = `actual - expected`. Negatif
fark için `notes` zorunlu.

- **Modül:** cash-register
- **Yetki:** `cash_register:session:close`
- **Audit:** `audit:cash_register.session.close` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`CashRegisterSessionCloseInput`):**

```json
POST /api/v1/cash-register/sessions/cr-uuid/close
{
  "actualBalance": "480.00",
  "notes": "20 TL eksik (küçük alışveriş unutuldu)"
}
```

- `actualBalance` (Decimal, ≥0) zorunlu.
- `notes` (string) — `actualBalance < expectedBalance` ise
  zorunlu (1-2000).

**Response 200 (`CashRegisterSession`):**

`CashRegisterSession`; `status='closed'`, `closedAt`,
`expectedBalance` (otomatik), `actualBalance`, `difference`
(negatif ise kırmızı flag).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CASH-0001` (404) — Session bulunamadı.
- `VET-CASH-0002` (409) — Zaten kapalı.
- `VET-VALIDATION-0010` (422) — Decimal hatası.
- `VET-CASH-0003` (422) — Eksik için `notes` zorunlu.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `expectedBalance` + `actualBalance` +
`difference` + `notes` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/cash-register.ts`
- Yeniden aç: `POST /api/v1/cash-register/sessions/{id}/reopen`
- Hareketler: `GET /api/v1/cash-register/sessions/{id}/movements`
- AI chunk: `flow-cash-register`
- Audit event: `audit:cash_register.session.close`
