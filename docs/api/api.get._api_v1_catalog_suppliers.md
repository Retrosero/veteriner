# GET /api/v1/catalog/suppliers

Tenant-scoped tedarikçi arama. Arşivlenmişler default dönmez
(`active=true`).

- **Modül:** suppliers
- **Yetki:** `catalog:supplier:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`SupplierFilters`):**

- `type` (enum) opsiyonel.
- `active` (boolean) opsiyonel, default `true`.
- `search` (string, 1-200) opsiyonel — `name` veya `code`.
- `taxId` (string) opsiyonel — exact match.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`SupplierListResponse`):**

```json
GET /api/v1/catalog/suppliers?type=clinic&active=true
{
  "items": [
    {
      "id": "sup-uuid",
      "code": "SUP-NBV-001",
      "name": "Nobivac Türkiye",
      "type": "clinic",
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

**Tenant izolasyonu:** Tüm sorgular tenant-scoped. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/supplier.ts`
- Oluştur: `POST /api/v1/catalog/suppliers`
- Detay: `GET /api/v1/catalog/suppliers/{id}`
- AI chunk: `flow-supplier`
