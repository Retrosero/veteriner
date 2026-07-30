# POST /api/v1/clinic/waitlist/{id}/schedule

Bekleme listesi kaydını randevuya dönüştürür. `status=scheduled`,
`scheduledAppointmentId` set. Aynı `id` + aynı `appointmentId` ile
tekrarlanan çağrı idempotent (no-op).

- **Modül:** waitlist
- **Yetki:** `clinic:appointment:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:waitlist.schedule` (severity: info) —
  patientId, ownerId, appointmentId, previousStatus.

**Path params:**

- `id` (string, zorunlu) — `wl-<uuid>`.

**Request body:**

```json
{
  "appointmentId": "appt-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

- `appointmentId` (string, zorunlu) — daha önce oluşturulmuş randevu
  ID'si (`appt-<uuid>`).

**Response 200:**

```json
{ "scheduled": true }
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CLINIC-0001` (404) — Waitlist kaydı bulunamadı / cross-tenant.
- `VET-CLINIC-0006` (422) — `cancelled` veya `expired` kayıt
  dönüştürülemez; ya da `scheduled` kayıt için farklı
  `appointmentId` deneniyor.

**Durum makinesi:**

```
waiting | notified → scheduled ✅
scheduled (same appointmentId) → no-op (idempotent)
scheduled (different appointmentId) → 422 VET-CLINIC-0006
cancelled | expired → scheduled ❌ (422 VET-CLINIC-0006)
```

**Not:** Bu endpoint yalnızca waitlist kaydını günceller. Randevu
kaydı önceden `POST /api/v1/clinic/appointments` ile oluşturulmuş
olmalıdır. Bu iki adımın tutarlılığı transaction sınırı içinde
sağlanmalıdır (production migration ile).

**Tenant izolasyonu:** `repo.findById(tenantId, id)` tenant filtresi
ile çalışır.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/waitlist.ts`
- Randevu oluşturma: `POST /api/v1/clinic/appointments`
- AI chunk: `flow-waitlist`
