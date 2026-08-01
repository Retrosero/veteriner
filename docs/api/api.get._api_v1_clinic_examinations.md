# GET /api/v1/clinic/examinations

Muayene listesini filtreli ve tenant-scoped döner. Sıralama
`startedAt desc` (en yeni başlayan üstte).

- **Modül:** examinations
- **Yetki:** `clinic:examination:read` (STAFF / VETERINARIAN)
- **Audit:** Yok (salt okuma).

**Query (`ExaminationFilters`):**

| Param          | Tip      | Açıklama                   |
| -------------- | -------- | -------------------------- |
| patientId      | string   | Hasta ID filtresi.         |
| veterinarianId | string   | Veteriner ID filtresi.     |
| status         | enum     | `in_progress               | completed | amended`. |
| from           | ISO 8601 | `startedAt >= from`.       |
| to             | ISO 8601 | `startedAt <= to`.         |
| limit          | 1-200    | Sayfa boyutu (default 20). |
| offset         | 0-10000  | Sayfa offset (default 0).  |

**Response 200 (`ExaminationListResponse`):**

```json
{
  "items": [
    {
      "id": "exam-7a1b2c3d-9b1deb4d",
      "tenantId": "tnt-uuid",
      "patientId": "pat-uuid",
      "veterinarianId": "usr-uuid",
      "appointmentId": "appt-uuid",
      "status": "in_progress",
      "type": "consultation",
      "chiefComplaint": "...",
      "startedAt": "2026-07-30T10:00:00.000Z",
      "completedAt": null,
      "signedAt": null,
      "signedBy": null,
      "createdAt": "2026-07-30T10:00:00.000Z",
      "updatedAt": "2026-07-30T10:00:00.000Z"
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

**Tenant izolasyonu:** `repo.search(tenantId, filters)` yalnızca
actor.tenantId kapsamında arar; cross-tenant kayıt asla dönmez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/examination.ts`
- Başlatma: `POST /api/v1/clinic/examinations`
- Detay: `GET /api/v1/clinic/examinations/{id}`
- AI chunk: `flow-examination-create`
