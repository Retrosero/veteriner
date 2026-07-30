# POST /api/v1/clinic/appointments/{id}/complete

Randevuyu tamamlandı olarak işaretler. Status `completed` yapılır,
`CalendarService.releaseSlot` ile booked slot serbest bırakılır.
`completed` durumdaki randevu idempotent (no-op). `cancelled` durumdaki
tamamlanamaz.

- **Modül:** appointments
- **Yetki:** `clinic:appointment:complete` (STAFF / VETERINARIAN)
- **Audit:** `audit:appointment.complete` (severity: info) — start,
  end, veterinarianId, previousStatus payload.

**Path params:**

- `id` (string, zorunlu) — `appt-<uuidv4>`.

**Request body:** Yok.

**Response 200:**

```json
{
  "completed": true
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Randevu bulunamadı / cross-tenant.
- `VET-APPT-0006` (422) — `cancelled` durumdan tamamlama denemesi.

**Tenant izolasyonu:** `repository.findById(tenantId, id)` tenant
filtresiyle çalışır. Cross-tenant `id` → 404.

**Durum makinesi:**

```
scheduled | confirmed | arrived | in_progress
  → completed ✅
completed → completed (idempotent, no-op)
cancelled → completed ❌ (422 VET-APPT-0006)
```

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/appointments.ts`
- Oluşturma: `POST /api/v1/clinic/appointments`
- Tamamlama sonrası: muayene açma akışı (FAZ-3 ileriki goal'lar).
- AI chunk: `flow-appointment-cancel`
