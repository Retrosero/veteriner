# POST /api/v1/clinic/appointments

Yeni randevu oluşturur. Patient + veterinarian aynı tenant'ta mı, start
gelecekte mi, slot uygun mu kontrollerinden sonra randevu kaydı
eklenir ve `CalendarService.bookSlot` ile booked slot yazılır.

- **Modül:** appointments
- **Yetki:** `clinic:appointment:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:appointment.create` (severity: info) —
  patientId, ownerId, veterinarianId, type, start, end, durationMin.

**Request body (`AppointmentCreateInput`):**

```json
{
  "patientId": "33333333-3333-3333-3333-333333333333",
  "veterinarianId": "vet-uuid",
  "type": "consultation",
  "start": "2026-07-31T10:00:00.000Z",
  "durationMin": 30,
  "branchId": "br-uuid",
  "notes": "İlk muayene"
}
```

- `patientId` (UUID, zorunlu) — aktif kayıtlı hayvan. Cross-tenant veya
  yok → 404 `VET-CLINIC-0001`.
- `veterinarianId` (string, zorunlu) — boş olamaz; yoksa 422
  `VET-VALIDATION-0009`. Tenant kuralı actor üzerinden enforce edilir.
- `type` (enum, zorunlu) — `consultation | vaccination | surgery |
follow_up | lab_visit | grooming`.
- `start` (ISO 8601, zorunlu) — gelecekte olmalı. Geçmiş → 422
  `VET-VALIDATION-0009`.
- `durationMin` (int, zorunlu) — `1-240`. `0` veya negatif → 422
  `VET-VALIDATION-0009`. `end = start + durationMin * 60_000`.
- `branchId` (UUID, opsiyonel) — yoksa `actor.branchId` kullanılır.
- `notes` (string, opsiyonel) — serbest metin.

**Response 201 (`Appointment`):**

```json
{
  "id": "appt-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "tenantId": "tnt-uuid",
  "patientId": "33333333-3333-3333-3333-333333333333",
  "ownerId": "own-uuid",
  "veterinarianId": "vet-uuid",
  "branchId": "br-uuid",
  "type": "consultation",
  "status": "scheduled",
  "start": "2026-07-31T10:00:00.000Z",
  "end": "2026-07-31T10:30:00.000Z",
  "notes": "İlk muayene",
  "createdBy": "usr-uuid",
  "createdAt": "2026-07-30T11:30:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-VALIDATION-0009` (422) — Geçmiş start veya `durationMin <= 0`.
- `VET-CLINIC-0001` (404) — Patient bulunamadı / cross-tenant.
- `VET-APPT-0005` (409) — Slot booked veya blocked çakışması
  (`details.reason = booked | blocked`, `details.conflictId`).

**Tenant izolasyonu:** `patientId` yalnızca actor.tenantId kapsamında
aranır. `CalendarService.checkAvailability` de tenant-scoped olduğu
için booked/blocked çakışma kontrolü başka tenant'ı görmez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/appointments.ts`
- Slot okuma: `GET /api/v1/calendar/days/{date}`
- Slot blok: `POST /api/v1/calendar/block`
- AI chunk: `flow-appointment-create`
