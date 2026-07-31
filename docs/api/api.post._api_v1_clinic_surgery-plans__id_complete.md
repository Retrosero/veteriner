# POST /api/v1/clinic/surgery-plans/{id}/complete

Ameliyatı tamamlar. `status='in_progress'` → `status='completed'`.
`actualEnd` set edilir. Anestezi bitişi ve operasyon notu
finalize tetiklenir.

- **Modül:** surgery-plans
- **Yetki:** `clinic:surgery:complete`
- **Audit:** `audit:surgery_plan.complete` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`SurgeryPlanCompleteInput`):**

```json
POST /api/v1/clinic/surgery-plans/sp-uuid/complete
{
  "outcome": "Başarılı",
  "complications": "Yok",
  "followUpNotes": "7 gün sonra kontrol"
}
```

- `outcome` (string, 1-500) zorunlu.
- `complications` (string) opsiyonel.
- `followUpNotes` (string) opsiyonel.

**Response 200 (`SurgeryPlan`):**

`SurgeryPlan`; `status='completed'`, `actualEnd`,
`completedBy`, `outcome`, `complications`, `followUpNotes`
set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Plan bulunamadı.
- (409) — Yalnızca `in_progress` tamamlanabilir.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Stok etkisi:** Operasyon notu (GOAL-083) ile kullanılan
malzemeler `clinical_usages` Faz 8 reaktif hook ile
kaydedilir.

**Audit detayı:** `outcome` + `complications` +
`actualDuration` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/surgery-plan.ts`
- Anestezi: `flow-anesthesia` (GOAL-082)
- Operasyon notu: `flow-operation-note` (GOAL-083)
- AI chunk: `flow-surgery-plan`
- Audit event: `audit:surgery_plan.complete`
