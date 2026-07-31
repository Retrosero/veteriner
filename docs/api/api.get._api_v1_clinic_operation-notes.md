# GET /api/v1/clinic/operation-notes

Tenant-scoped operasyon notu arama. `status`/`patientId`/
`surgeryPlanId`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** operation-notes
- **Yetki:** `clinic:surgery:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`OperationNoteFilters`):**

- `status` (enum: `draft|finalized|amended`) opsiyonel.
- `patientId` (string) opsiyonel.
- `surgeryPlanId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`OperationNoteListResponse`):**

```json
GET /api/v1/clinic/operation-notes?status=finalized&limit=20
{
  "items": [
    {
      "id": "opn-uuid",
      "surgeryPlanId": "sp-uuid",
      "patientId": "pat-uuid",
      "procedureName": "Kısırlaştırma (OVH)",
      "status": "finalized",
      "finalizedAt": "2026-08-10T11:30:00.000Z"
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

- API sözleşmesi: `packages/contracts/src/operation-note.ts`
- Oluştur: `POST /api/v1/clinic/operation-notes`
- AI chunk: `flow-operation-note`
