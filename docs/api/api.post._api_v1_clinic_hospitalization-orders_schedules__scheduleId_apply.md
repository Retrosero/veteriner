# POST /api/v1/clinic/hospitalization-orders/schedules/{scheduleId}/apply

Schedule'ı uygulandı olarak işaretle. `status='pending'`
→ `'applied'`. `appliedAt` + `appliedBy` set edilir.
Stok düşümü `type='medication'` ise Faz 8 reaktif hook ile
`clinical_usage` (GOAL-066) tetiklenir.

- **Modül:** hospitalization-orders
- **Yetki:** `clinic:hospitalization:add_note`
- **Audit:** `audit:hospitalization_order.schedule.apply` (info)

**Path parametreleri:**

- `scheduleId` (UUID) zorunlu.

**Request body (`HospitalizationOrderScheduleApplyInput`):**

```json
POST /api/v1/clinic/hospitalization-orders/schedules/hos-uuid/apply
{
  "actualDose": "1 tablet",
  "notes": "Hasta iyi tolere etti"
}
```

- `actualDose` (string) opsiyonel.
- `notes` (string) opsiyonel.

**Response 200 (`HospitalizationOrderSchedule`):**

`HospitalizationOrderSchedule`; `status='applied'`,
`appliedAt`, `appliedBy`, `actualDose` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Schedule bulunamadı.
- (409) — Zaten `applied` veya `skipped`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization-order.ts`
- Skip: `POST /api/v1/clinic/hospitalization-orders/schedules/{scheduleId}/skip`
- AI chunk: `flow-hospitalization-order`
- Audit event: `audit:hospitalization_order.schedule.apply`
