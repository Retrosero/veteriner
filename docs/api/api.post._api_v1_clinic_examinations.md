# POST /api/v1/clinic/examinations

Yeni muayene başlatır. `appointmentId` üzerinden `patientId` ve
`veterinarianId` türetilir; status `in_progress` olarak işaretlenir.

- **Modül:** examinations
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:examination.create` (severity: info) —
  appointmentId, patientId, veterinarianId, type, status.

**Request body (`ExaminationCreateInput`):**

```json
{
  "appointmentId": "appt-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "type": "consultation",
  "chiefComplaint": "3 gündür iştahsız, ara sıra kusma"
}
```

- `appointmentId` (string, zorunlu) — daha önce oluşturulmuş randevu
  ID'si (`appt-<uuid>`). Aynı tenant'ta olmalı (cross-tenant → 404).
- `type` (enum, zorunlu) — `consultation | follow_up | emergency |
  routine_check`.
- `chiefComplaint` (string, 1-2000 karakter, zorunlu) — şikâyet
  özeti.

**Response 201 (`Examination`):**

```json
{
  "id": "exam-7a1b2c3d-9b1deb4d",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
  "veterinarianId": "usr-uuid",
  "appointmentId": "appt-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "in_progress",
  "type": "consultation",
  "chiefComplaint": "3 gündür iştahsız, ara sıra kusma",
  "startedAt": "2026-07-30T10:00:00.000Z",
  "completedAt": null,
  "signedAt": null,
  "signedBy": null,
  "createdAt": "2026-07-30T10:00:00.000Z",
  "updatedAt": "2026-07-30T10:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CLINIC-0001` (404) — Appointment veya patient
  bulunamadı / cross-tenant.

**İş kuralları:**

- `appointmentId` aynı tenant'ta olmalı; `AppointmentsService.findById`
  üzerinden implicit hasta + veteriner doğrulaması.
- `patientId` / `veterinarianId` request body'de kabul edilmez;
  appointment'tan türetilir (bilgi sızdırmaz).
- Aynı appointment için birden fazla aktif muayene açılabilir
  (in_progress); business rule tekil'i ileride doğrulanır.

**Tenant izolasyonu:** `AppointmentsService.findById(tenantId, ...)`
ve `PatientsService.findById(tenantId, ...)` yalnızca actor.tenantId
kapsamında arar; yeni muayene `tenantId` ile insert edilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/examination.ts`
- Tamamla: `POST /api/v1/clinic/examinations/{id}/complete`
- AI chunk: `flow-examination-create`
