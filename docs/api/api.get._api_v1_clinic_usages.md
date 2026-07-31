# GET /api/v1/clinic/usages

Tenant-scoped klinik tüketim kaydı arama. `productId`/
`sourceType`/`sourceId`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** clinical-usages
- **Yetki:** `clinic:stock:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`ClinicalUsageFilters`):**

- `productId` (string) opsiyonel.
- `sourceType` (enum) opsiyonel.
- `sourceId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`ClinicalUsageListResponse`):**

```json
GET /api/v1/clinic/usages?productId=prd-uuid&limit=20
{
  "items": [
    {
      "id": "cu-uuid",
      "productId": "prd-uuid",
      "quantity": "2.00",
      "sourceType": "examination",
      "sourceId": "exam-uuid",
      "createdAt": "2026-07-30T15:00:00.000Z"
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

- API sözleşmesi: `packages/contracts/src/clinical-usage.ts`
- Oluştur: `POST /api/v1/clinic/usages`
- Detay: `GET /api/v1/clinic/usages/{id}`
- AI chunk: `flow-clinical-usage`
