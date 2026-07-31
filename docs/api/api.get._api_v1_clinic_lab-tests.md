# GET /api/v1/clinic/lab-tests

Tenant-scoped laboratuvar test kataloğu arama.
`category`/`specimenType`/`active`/`search` filtreleri.

- **Modül:** lab-tests
- **Yetki:** `clinic:lab:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`LabTestFilters`):**

- `category` (enum) opsiyonel.
- `specimenType` (enum) opsiyonel.
- `active` (boolean) opsiyonel, default `true`.
- `search` (string, 1-200) opsiyonel — `name` veya `code`.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`LabTestListResponse`):**

```json
GET /api/v1/clinic/lab-tests?category=hematology
{
  "items": [
    {
      "id": "lt-uuid",
      "code": "CBC",
      "name": "Tam kan sayımı",
      "category": "hematology",
      "specimenType": "blood",
      "tatHours": 4,
      "price": "120.00",
      "currency": "TRY"
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

- API sözleşmesi: `packages/contracts/src/lab-test.ts`
- Oluştur: `POST /api/v1/clinic/lab-tests`
- AI chunk: `flow-lab-test`
