# GET /api/v1/clinic/hospitalizations

Tenant-scoped yatış arama. `status`/`patientId`/
`admittingVetId`/`dateFrom`/`dateTo`/`cageId` filtreleri.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`HospitalizationFilters`):**

- `status` (enum: `planned|admitted|discharged|cancelled`)
  opsiyonel.
- `patientId` (string) opsiyonel.
- `admittingVetId` (string) opsiyonel.
- `cageId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`HospitalizationListResponse`):**

```json
GET /api/v1/clinic/hospitalizations?status=admitted
{
  "items": [
    {
      "id": "hosp-uuid",
      "patientId": "pat-uuid",
      "admittingVetId": "usr-uuid",
      "status": "admitted",
      "currentCageId": "cage-uuid",
      "admittedAt": "2026-07-30T13:00:00.000Z"
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

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Oluştur: `POST /api/v1/clinic/hospitalizations`
- AI chunk: `flow-hospitalization`
