# GET /api/v1/clinic/examinations/{id}

ID'ye göre muayene detayı. Cross-tenant → 404 (bilgi sızdırmaz).

- **Modül:** examinations
- **Yetki:** `clinic:examination:read` (STAFF / VETERINARIAN)
- **Audit:** Yok (salt okuma).

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Response 200 (`Examination`):**

```json
{
  "id": "exam-7a1b2c3d-9b1deb4d",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
  "veterinarianId": "usr-uuid",
  "appointmentId": "appt-uuid",
  "status": "completed",
  "type": "consultation",
  "chiefComplaint": "...",
  "startedAt": "2026-07-30T10:00:00.000Z",
  "completedAt": "2026-07-30T10:25:00.000Z",
  "signedAt": "2026-07-30T10:30:00.000Z",
  "signedBy": "usr-vet-uuid",
  "createdAt": "2026-07-30T10:00:00.000Z",
  "updatedAt": "2026-07-30T10:30:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Muayene bulunamadı / cross-tenant.

**Tenant izolasyonu:** `repo.findById(tenantId, id)` yalnızca
actor.tenantId kapsamında arar.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/examination.ts`
- Liste: `GET /api/v1/clinic/examinations`
- Tamamla: `POST /api/v1/clinic/examinations/{id}/complete`
- İmzala: `POST /api/v1/clinic/examinations/{id}/sign`
- Düzelt: `POST /api/v1/clinic/examinations/{id}/amend`
