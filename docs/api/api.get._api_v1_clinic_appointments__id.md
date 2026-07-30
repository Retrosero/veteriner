# GET /api/v1/clinic/appointments/{id}

ID'ye göre randevu detayı. Cross-tenant `id` veya bulunmayan kayıt
→ 404 (bilgi sızdırmaz).

- **Modül:** appointments
- **Yetki:** `clinic:appointment:read` (STAFF / VETERINARIAN / OWNER)
- **Audit:** YAYINLAMAZ.

**Path params:**

- `id` (string, zorunlu) — `appt-<uuidv4>`.

**Response 200 (`Appointment`):**

```json
{
  "id": "appt-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
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
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Randevu bulunamadı / cross-tenant.

**Tenant izolasyonu:** `repository.findById(tenantId, id)` her zaman
tenant filtresiyle arar. SUPERADMIN her tenant'a erişebilir (`require
TenantScope` bypass), diğer roller yalnızca kendi tenant'ından okur.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/appointments.ts`
- Liste: `GET /api/v1/clinic/appointments`
- Güncelle: `PATCH /api/v1/clinic/appointments/{id}`
- AI chunk: `flow-appointment-create`
