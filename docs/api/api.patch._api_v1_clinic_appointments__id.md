# PATCH /api/v1/clinic/appointments/{id}

Randevu alanlarını kısmi olarak günceller. `start`, `durationMin` veya
`veterinarianId` değiştiğinde booked slot serbest bırakılır, yeni
zaman için `CalendarService.checkAvailability` ile çakışma kontrolü
tekrar yapılır. Çakışma durumunda eski booked slot compensation ile
geri konur.

- **Modül:** appointments
- **Yetki:** `clinic:appointment:update` (STAFF / VETERINARIAN)
- **Audit:** `audit:appointment.update` (severity: info) — `before`
  ve `after` snapshot (start, end, veterinarianId, type, status).

**Path params:**

- `id` (string, zorunlu) — `appt-<uuidv4>`.

**Request body (`AppointmentUpdateInput`):**

```json
{
  "start": "2026-07-31T11:00:00.000Z",
  "durationMin": 45,
  "veterinarianId": "vet-uuid",
  "type": "vaccination",
  "status": "confirmed",
  "notes": "Aşı planı"
}
```

- Tüm alanlar opsiyoneldir. En az biri sağlanmalı.
- `start` (ISO 8601) — gelecekte olmalı; geçmiş → 422
  `VET-VALIDATION-0009`.
- `durationMin` (1-240).
- `status` (enum) — `scheduled | confirmed | arrived | in_progress |
completed | cancelled | no_show`. `cancelled` ve `completed` durumdan
  güncelleme → 422 `VET-APPT-0006` (ayrı endpoint'ler kullanın:
  `/cancel`, `/complete`, `/no-show`).
- `type` (enum), `veterinarianId` (string), `notes` (string | null).

**Response 200 (`Appointment`):** Oluşturma yanıtıyla aynı şema.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-VALIDATION-0009` (422) — Geçmiş start.
- `VET-CLINIC-0001` (404) — Randevu bulunamadı / cross-tenant.
- `VET-APPT-0005` (409) — Yeni slot booked/blocked çakışması
  (`details.reason = booked | blocked`).
- `VET-APPT-0006` (422) — `cancelled` veya `completed` durumdan güncelleme.

**Tenant izolasyonu:** `repository.findById(tenantId, id)` tenant
filtresiyle çalışır. Cross-tenant `id` → 404.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/appointments.ts`
- Oluşturma: `POST /api/v1/clinic/appointments`
- İptal: `POST /api/v1/clinic/appointments/{id}/cancel`
- AI chunk: `flow-appointment-create`
