# POST /api/v1/clinic/appointments/{id}/no-show

Hasta sahibinin randevuya gelmediğini işaretler. Status `no_show`
yapılır, `CalendarService.releaseSlot` ile booked slot serbest
bırakılır. `no_show` durumdaki randevu idempotent (no-op). `cancelled`
veya `completed` durumdaki no-show yapılamaz.

- **Modül:** appointments
- **Yetki:** `clinic:appointment:complete` (STAFF / VETERINARIAN)
- **Audit:** `audit:appointment.no_show` (severity: **warning**) —
  start, end, veterinarianId, previousStatus payload.

**Path params:**

- `id` (string, zorunlu) — `appt-<uuidv4>`.

**Request body:** Yok.

**Response 200:**

```json
{
  "marked": true
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Randevu bulunamadı / cross-tenant.
- `VET-APPT-0006` (422) — `cancelled` veya `completed` durumdan
  no-show denemesi.

**Tenant izolasyonu:** `repository.findById(tenantId, id)` tenant
filtresiyle çalışır. Cross-tenant `id` → 404.

**Durum makinesi:**

```
scheduled | confirmed | arrived | in_progress
  → no_show ✅
no_show → no_show (idempotent, no-op)
cancelled | completed → no_show ❌ (422 VET-APPT-0006)
```

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/appointments.ts`
- İptal: `POST /api/v1/clinic/appointments/{id}/cancel`
- Tamamla: `POST /api/v1/clinic/appointments/{id}/complete`
- AI chunk: `flow-appointment-cancel`
