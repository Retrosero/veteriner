# POST /api/v1/clinic/portal-appointments/requests/{id}/approve

Personel (`STAFF` / `VETERINARIAN`) bekleyen bir **online randevu
talebini** onaylar. Service `AppointmentsService.create` çağrısı ile
gerçek randevuyu oluşturur; talep `approved` statüsüne geçer ve
oluşturulan `Appointment` ID'si talebe yazılır
(`approvedAppointmentId`). Calendar çakışması (booked/blocked) veya
`preferredDate` artık geçmişte kalırsa hata fırlatır; talep yine
`pending` kalır.

- **Modül:** portal-appointments (clinic controller)
- **Yetki:** `clinic:appointment:create` (STAFF / VETERINARIAN).
  `PermissionsGuard` + `RequirePermissions` decorator.
- **Audit:** `audit:portal.appointment.approve` (severity: info) —
  patientId, ownerId, appointmentId, decidedBy, previousStatus.
- **Idempotency:** Hayır — ikinci `approve` → 422.
- **Yan etki:** `AppointmentsService.create` ile randevu
  oluşturulur; sahibine in-app onay bildirimi gönderilir
  (template `portal.appointment.approved`, best-effort).

## Request

**Path params:**

- `id` (string, zorunlu) — `pareq-<tenant8>-<stamp>-<rnd>`.

**Headers:**

- Standart personel auth (session cookie / `Authorization: Bearer`).

Body: Yok.

## Response

**200 OK:**

```json
{
  "request": {
    "id": "pareq-tntaaaaa-xxxx-yyyy",
    "tenantId": "tnt-uuid",
    "patientId": "pat-uuid-1",
    "ownerId": "own-uuid",
    "status": "approved",
    "preferredDate": "2026-08-15T10:00:00.000Z",
    "preferredVeterinarianId": "vet-uuid",
    "type": "consultation",
    "reason": "Yıllık kontrol",
    "contactPreference": "phone",
    "requestedAt": "2026-07-30T12:00:00.000Z",
    "decidedAt": "2026-07-31T08:30:00.000Z",
    "decidedBy": "usr-decider",
    "rejectionReason": null,
    "approvedAppointmentId": "appt-stub-42"
  },
  "appointment": {
    "id": "appt-stub-42",
    "tenantId": "tnt-uuid",
    "patientId": "pat-uuid-1",
    "ownerId": "own-uuid",
    "veterinarianId": "vet-uuid",
    "branchId": null,
    "type": "consultation",
    "status": "scheduled",
    "start": "2026-08-15T10:00:00.000Z",
    "end": "2026-08-15T10:30:00.000Z",
    "notes": null,
    "createdBy": "usr-decider",
    "createdAt": "2026-07-31T08:30:00.000Z"
  }
}
```

- `appointment` — `AppointmentsService.findById` ile çekilir;
  geçici olarak null gelirse 404 `VET-CLINIC-0001` (normal
  akışta oluşmaz).
- `durationMin` default 30; FAZ-0'da değiştirilemez.

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — `clinic:appointment:create` yetkisi yok
  veya tenant uyumsuz.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Talep bulunamadı / cross-tenant.
- `VET-PORTAL-0006` (422) — Talep `pending` değil (`approved |
  rejected | cancelled`).
- `VET-VALIDATION-0009` (422) — Onay anında `preferredDate` artık
  geçmişte.
- `VET-APPT-0005` (409) — `AppointmentsService.create` slot
  çakışması fırlattı (`details.reason = booked | blocked`,
  `details.conflictId`); talep `pending` kalır.

## Güvenlik notları

- `decidedBy` kaynağı `actor.actorId`; null ise fallback `"system"`
  (audit payload'da explicit).
- `AppointmentsService.create` zaten tenant-scoped; randevu
  oluşturulamazsa hata propagate olur ve talep `pending` kalır
  (state corruption'a izin verilmez).
- `requireTenantScope` cross-tenant denemeyi 403 ile reddeder;
  SUPERADMIN bypass'lı.
- Onay bildirimi `notifications.send` hatası akışı **durdurmaz**
  (best-effort).

**Durum makinesi:**

```
pending    → approved ✅ (randevu oluşturulur, audit.info)
approved   → approved ❌ (422 VET-PORTAL-0006)
rejected   → approved ❌ (422 VET-PORTAL-0006)
cancelled  → approved ❌ (422 VET-PORTAL-0006)
```

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-appointment-request.ts`
- Randevu: `POST /api/v1/clinic/appointments`
- Red: `POST /api/v1/clinic/portal-appointments/requests/{id}/reject`
- AI chunk: `flow-portal-appointment-request`
