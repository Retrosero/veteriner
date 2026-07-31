# POST /api/v1/clinic/surgery-plans/{id}/cancel

Ameliyatı iptal eder. `status='planned'` veya `'in_progress'`
→ `'cancelled'`. `in_progress` iken iptal `reason` zorunlu.

- **Modül:** surgery-plans
- **Yetki:** `clinic:surgery:cancel` (yüksek yetki)
- **Audit:** `audit:surgery_plan.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`SurgeryPlanCancelInput`):**

```json
POST /api/v1/clinic/surgery-plans/sp-uuid/cancel
{
  "reason": "Hasta stabil değil"
}
```

- `reason` (string, 1-2000) zorunlu (her durumda).

**Response 200 (`SurgeryPlan`):**

`SurgeryPlan`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Plan bulunamadı.
- (409) — Zaten `completed` veya `cancelled`.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Anestezi/operasyon notu etkisi:** `in_progress` iken
iptal edilirse anestezi acil kapatılır (`actualEnd=now`,
`outcome='aborted'`) ve operasyon notu `cancelled`
flag'lenir.

**Audit detayı:** `reason` + `previousStatus` +
`actualDuration?` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/surgery-plan.ts`
- Detay: `GET /api/v1/clinic/surgery-plans/{id}`
- Anestezi: `flow-anesthesia` (GOAL-082)
- AI chunk: `flow-surgery-plan`
- Audit event: `audit:surgery_plan.cancel`
