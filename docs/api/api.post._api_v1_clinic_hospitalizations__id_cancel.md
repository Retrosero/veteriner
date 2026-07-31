# POST /api/v1/clinic/hospitalizations/{id}/cancel

Yatışı iptal eder. `status='planned'` veya
`'admitted'` → `'cancelled'`. Admit edildiyse önce
discharge önerilir (yine de force cancel mümkün).

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:admit` (yüksek yetki)
- **Audit:** `audit:hospitalization.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`HospitalizationCancelInput`):**

```json
POST /api/v1/clinic/hospitalizations/hosp-uuid/cancel
{
  "reason": "Hasta sahibi vazgeçti",
  "force": true
}
```

- `reason` (string, 1-2000) zorunlu.
- `force` (boolean) opsiyonel — `admitted` iken
  iptal için `true` gerekir.

**Response 200 (`Hospitalization`):**

`Hospitalization`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir; kafes
boşaltılır.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Yatış bulunamadı.
- (409) — `force` olmadan `admitted` iptal edilemez.
- (409) — Zaten `cancelled` veya `discharged`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Detay: `GET /api/v1/clinic/hospitalizations/{id}`
- AI chunk: `flow-hospitalization`
- Audit event: `audit:hospitalization.cancel`
