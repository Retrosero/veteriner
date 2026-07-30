# GET /api/v1/clinic/appointments

Tenant kapsamında randevu listesi. Filtreler: `patientId`,
`veterinarianId`, `status`, `from` (ISO), `to` (ISO), `limit` (1-200,
default 50), `offset` (default 0). Sonuç `AppointmentListResponse`
şemasında döner: `items` + `total`.

- **Modül:** appointments
- **Yetki:** `clinic:appointment:read` (STAFF / VETERINARIAN / OWNER)
- **Audit:** YAYINLAMAZ (read-heavy; gürültü kontrolü).

**Query (`AppointmentFilters`):**

```
GET /api/v1/clinic/appointments
  ?patientId=33333333-3333-3333-3333-333333333333
  &veterinarianId=vet-uuid
  &status=scheduled
  &from=2026-07-01T00:00:00.000Z
  &to=2026-07-31T23:59:59.999Z
  &limit=50
  &offset=0
```

- `patientId` (UUID, opsiyonel) — hasta bazlı liste.
- `veterinarianId` (string, opsiyonel) — veteriner bazlı liste.
- `status` (enum, opsiyonel) — `scheduled | confirmed | arrived |
  in_progress | completed | cancelled | no_show`.
- `from` / `to` (ISO 8601, opsiyonel) — `start` aralığı.
- `limit` (1-200, default 50), `offset` (≥0, default 0).

**Response 200 (`AppointmentListResponse`):**

```json
{
  "items": [
    {
      "id": "appt-uuid",
      "tenantId": "tnt-uuid",
      "patientId": "pat-uuid",
      "ownerId": "own-uuid",
      "veterinarianId": "vet-uuid",
      "branchId": "br-uuid",
      "type": "consultation",
      "status": "scheduled",
      "start": "2026-07-31T10:00:00.000Z",
      "end": "2026-07-31T10:30:00.000Z",
      "notes": null,
      "createdBy": "usr-uuid",
      "createdAt": "2026-07-30T11:30:00.000Z"
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.

**Tenant izolasyonu:** `repository.search(tenantId, ...)` her zaman
tenant filtresiyle çalışır. SUPERADMIN de kendi tenantId'si ile sınırlı
değildir; bu yüzden `actor.tenantId` üzerinden ayrıca filtre uygulanır
(`requireTenantScope`).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/appointments.ts`
- Detay: `GET /api/v1/clinic/appointments/{id}`
- Oluşturma: `POST /api/v1/clinic/appointments`
- AI chunk: `flow-appointment-create`
