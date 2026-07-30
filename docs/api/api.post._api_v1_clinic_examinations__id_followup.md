# POST /api/v1/clinic/examinations/{id}/followup

Muayeneden kontrol randevusu (follow-up) oluşturur. Sonuç, normal
bir `Appointment` olup `type='follow_up'`, `durationMin=30` ve
`notes` alanı `[Kontrol Randevusu] {notes}` şeklinde doldurulmuş
appointment'tır. Calendar uygunluk kontrolü, idempotency ve status
yönetimi `AppointmentsService.create` üzerinden gelir.

- **Modül:** followups
- **Yetki:** `clinic:appointment:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:followup.create` (severity: info) —
  `source: 'examination'`, examinationId, patientId, veterinarianId,
  start, end, type.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`FollowUpFromExaminationInput`):**

```json
{
  "followUpDate": "2026-08-15T10:00:00.000Z",
  "veterinarianId": "usr-vet-uuid",
  "notes": "Antibiyotik tedavisi sonrası kontrol."
}
```

- `followUpDate` (ISO 8601 datetime, zorunlu) — Kontrol randevusunun
  başlangıç zamanı. Gelecekte olmalı (geçmiş/invalid → 422
  `VET-VALIDATION-0009`).
- `veterinarianId` (string, opsiyonel) — Override veteriner.
  Verilmezse `examination.veterinarianId` kullanılır; her ikisi de
  yoksa 422 `VET-VALIDATION-0009`.
- `notes` (string, max 2000, opsiyonel) — Randevu notuna
  `[Kontrol Randevusu] {notes}` şeklinde yazılır.

**Response 201 (`Appointment`):**

```json
{
  "id": "appt-7a1b2c3d-000123",
  "tenantId": "tnt-uuid",
  "patientId": "33333333-3333-3333-333333333333",
  "veterinarianId": "usr-vet-uuid",
  "type": "follow_up",
  "status": "scheduled",
  "start": "2026-08-15T10:00:00.000Z",
  "end": "2026-08-15T10:30:00.000Z",
  "durationMin": 30,
  "notes": "[Kontrol Randevusu] Antibiyotik tedavisi sonrası kontrol.",
  "createdAt": "2026-07-30T12:00:00.000Z",
  "updatedAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Body parse hatası (enum, range,
  `.strict()`).
- `VET-VALIDATION-0009` (422) — `followUpDate` invalid veya
  geçmişte; ya da veteriner ID türetilemedi.
- `VET-CLINIC-0001` (404) — Examination bulunamadı / cross-tenant.
- `VET-APPT-0005` (409) — Slot çakışması (AppointmentsService.create
  üzerinden).
- `VET-APPT-0001` (422) — Geçersiz zaman aralığı (AppointmentsService
  üzerinden).

**İş kuralları:**

- Examination `ExaminationsService.findById(tenantId, id, actor)` ile
  aynı tenant'ta mı doğrulanır; cross-tenant → 404 `VET-CLINIC-0001`
  (bilgi sızdırmaz).
- Zod şema `.strict()` — bilinmeyen alan reddedilir (422
  `VET-VALIDATION-0001`).
- `patientId` muayeneden türetilir; client gönderemez. `veterinarianId`
  override opsiyonel; yoksa muayeneden türetilir; her ikisi de yoksa
  422 `VET-VALIDATION-0009`.
- `followUpDate` gelecekte olmalı; invalid datetime veya
  `ts <= now` → 422 `VET-VALIDATION-0009`.
- Randevu `AppointmentsService.create` ile oluşturulur; calendar
  uygunluk kontrolü (slot çakışması → 409 `VET-APPT-0005`),
  idempotency ve status yönetimi o katmandan gelir.
- `durationMin=30` sabit; `notes` otomatik prefix'lenir
  (`[Kontrol Randevusu] …`).
- `type='follow_up'` dışındaki appointment türleri için bu
  endpoint kullanılmaz.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/followup.ts`
- Reçeteden kontrol: `POST /api/v1/clinic/prescriptions/{id}/followup`
- Hastanın bekleyen kontrol listesi:
  `GET /api/v1/clinic/patients/{id}/followups`
- Appointment listesi: `GET /api/v1/clinic/appointments`
- AI chunk: `flow-followup`
