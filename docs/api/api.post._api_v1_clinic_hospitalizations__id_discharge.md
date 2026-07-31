# POST /api/v1/clinic/hospitalizations/{id}/discharge

Yatışı taburcu eder. `status='admitted'` →
`status='discharged'`. `dischargedAt` set edilir.
Taburcu özeti (GOAL-086) ile bağlanır.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:discharge` (yüksek yetki)
- **Audit:** `audit:hospitalization.discharge` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`HospitalizationDischargeInput`):**

```json
POST /api/v1/clinic/hospitalizations/hosp-uuid/discharge
{
  "dischargeCondition": "recovered",
  "dischargeInstructions": "İlaçlara 7 gün devam",
  "followUpDate": "2026-08-15T10:00:00.000Z"
}
```

- `dischargeCondition` (enum: `recovered|improved|
  unchanged|transferred|deceased`) zorunlu.
- `dischargeInstructions` (string) opsiyonel.
- `followUpDate` (ISO datetime) opsiyonel.

**Response 200 (`Hospitalization`):**

`Hospitalization`; `status='discharged'`, `dischargedAt`,
`dischargedBy`, `dischargeCondition` set edilir; kafes
boşaltılır.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Yatış bulunamadı.
- (409) — Yalnızca `admitted` taburcu edilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Detay: `GET /api/v1/clinic/hospitalizations/{id}`
- Taburcu özeti: `flow-discharge-summary` (GOAL-086)
- AI chunk: `flow-hospitalization`
- Audit event: `audit:hospitalization.discharge`
