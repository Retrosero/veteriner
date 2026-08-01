# POST /api/v1/clinic/hospitalization-orders/schedules/{scheduleId}/skip

Schedule'ı atlandı olarak işaretle. `status='pending'`
→ `'skipped'`. `skipReason` zorunlu.

- **Modül:** hospitalization-orders
- **Yetki:** `clinic:hospitalization:add_note`
- **Audit:** `audit:hospitalization_order.schedule.skip` (info)

**Path parametreleri:**

- `scheduleId` (UUID) zorunlu.

**Request body (`HospitalizationOrderScheduleSkipInput`):**

```json
POST /api/v1/clinic/hospitalization-orders/schedules/hos-uuid/skip
{
  "skipReason": "Hasta yemek yiyemedi"
}
```

- `skipReason` (enum: `patient_refused|vomited|asleep|
missed_window|out_of_stock|other`) zorunlu.
- `notes` (string) opsiyonel.

**Response 200 (`HospitalizationOrderSchedule`):**

`HospitalizationOrderSchedule`; `status='skipped'`,
`skippedAt`, `skippedBy`, `skipReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Schedule bulunamadı.
- (409) — Zaten `applied` veya `skipped`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization-order.ts`
- Apply: `POST /api/v1/clinic/hospitalization-orders/schedules/{scheduleId}/apply`
- AI chunk: `flow-hospitalization-order`
- Audit event: `audit:hospitalization_order.schedule.skip`
