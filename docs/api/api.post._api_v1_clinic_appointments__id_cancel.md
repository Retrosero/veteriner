# POST /api/v1/clinic/appointments/{id}/cancel

Randevuyu iptal eder. Status `cancelled` yapılır, `CalendarService
.releaseSlot` ile booked slot serbest bırakılır. `cancelled`
durumdaki randevu idempotent (no-op). `completed` durumdaki iptal
edilemez.

- **Modül:** appointments
- **Yetki:** `clinic:appointment:cancel` (STAFF / VETERINARIAN)
- **Audit:** `audit:appointment.cancel` (severity: **warning**) —
  start, end, veterinarianId, previousStatus, **reason** payload
  (zorunlu).

**Path params:**

- `id` (string, zorunlu) — `appt-<uuidv4>`.

**Request body (`AppointmentCancelInput`):**

```json
{
  "reason": "Hasta sahibi aradı, iptal istedi"
}
```

- `reason` (string, zorunlu) — 1-200 karakter. Neden zorunludur;
  audit log'a yazılır.

**Response 200:**

```json
{
  "cancelled": true
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası (örn. reason
  boş/eksik).
- `VET-CLINIC-0001` (404) — Randevu bulunamadı / cross-tenant.
- `VET-APPT-0006` (422) — `completed` durumdan iptal denemesi.

**Tenant izolasyonu:** `repository.findById(tenantId, id)` tenant
filtresiyle çalışır. Cross-tenant `id` → 404.

**Durum makinesi:**

```
scheduled | confirmed | arrived | in_progress
  → cancelled ✅
cancelled → cancelled (idempotent, no-op)
completed → cancelled ❌ (422 VET-APPT-0006)
```

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/appointments.ts`
- Oluşturma: `POST /api/v1/clinic/appointments`
- Tamamla: `POST /api/v1/clinic/appointments/{id}/complete`
- AI chunk: `flow-appointment-cancel`
