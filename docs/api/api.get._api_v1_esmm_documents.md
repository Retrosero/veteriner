# GET /api/v1/esmm/documents

Tenant-scoped e-SMM belge arama. `documentType`/`status`/
`sourceType`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** esmm
- **Yetki:** `audit:log:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`EsmmDocumentFilters`):**

- `documentType` (enum: `invoice|dispatch|receipt`) opsiyonel.
- `status` (enum: `draft|pending|submitted|accepted|
  rejected|failed|cancelled`) opsiyonel.
- `sourceType` (enum: `clinic_sale|petshop_sale|...`)
  opsiyonel.
- `sourceId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`EsmmDocumentListResponse`):**

```json
GET /api/v1/esmm/documents?status=pending&limit=20
{
  "items": [
    {
      "id": "esmm-uuid",
      "documentType": "invoice",
      "status": "pending",
      "totalAmount": "240.00",
      "currency": "TRY",
      "createdAt": "2026-07-30T17:00:00.000Z"
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

- API sözleşmesi: `packages/contracts/src/esmm.ts`
- Oluştur: `POST /api/v1/esmm/documents`
- AI chunk: `flow-esmm`
