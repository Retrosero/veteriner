# GET /api/v1/clinic/cages

Tenant-scoped kafes listesi. `type`/`active`/`available`/
`search` filtreleri.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`CageFilters`):**

- `type` (enum) opsiyonel.
- `active` (boolean) opsiyonel, default `true`.
- `available` (boolean) opsiyonel — `true`: yalnız
  `currentOccupancy < capacity`.
- `search` (string, 1-200) opsiyonel — `name` veya `code`.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`CageListResponse`):**

```json
GET /api/v1/clinic/cages?type=isolation&available=true
{
  "items": [
    {
      "id": "cage-uuid",
      "code": "ISO-001",
      "name": "İzolasyon 1",
      "type": "isolation",
      "capacity": 1,
      "currentOccupancy": 0,
      "active": true
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
- Oluştur: `POST /api/v1/clinic/cages`
- AI chunk: `flow-hospitalization`
