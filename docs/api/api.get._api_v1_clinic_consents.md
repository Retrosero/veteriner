# GET /api/v1/clinic/consents

Tenant-scoped onam formu arama. `status`/`templateType`/
`patientId`/`ownerId`/`sourceType` filtreleri.

- **Modül:** consents
- **Yetki:** `clinic:consent:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`ConsentFilters`):**

- `status` (enum: `draft|signed|revoked|expired`) opsiyonel.
- `templateId` (string) opsiyonel.
- `patientId` (string) opsiyonel.
- `ownerId` (string) opsiyonel.
- `sourceType` (enum) opsiyonel.
- `sourceId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`ConsentListResponse`):**

```json
GET /api/v1/clinic/consents?status=signed&limit=20
{
  "items": [
    {
      "id": "con-uuid",
      "templateId": "ct-surgery-general",
      "patientId": "pat-uuid",
      "ownerId": "own-uuid",
      "status": "signed",
      "signedAt": "2026-07-30T13:00:00.000Z"
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

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/consent.ts`
- Oluştur: `POST /api/v1/clinic/consents`
- AI chunk: `flow-consent`
