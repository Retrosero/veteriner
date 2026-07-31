# GET /api/v1/inventory/warehouses

Tenant-scoped depo arama. Arşivlenmiş depolar default olarak
dönmez (`active=true` filtresi).

- **Modül:** inventory
- **Yetki:** `inventory:warehouse:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`WarehouseFilters`):**

- `type` (enum: `clinic|petshop|general`) opsiyonel.
- `active` (boolean) opsiyonel, default `true`.
- `search` (string, 1-200) opsiyonel — `name` veya `code`
  case-insensitive contains.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`WarehouseListResponse`):**

```json
GET /api/v1/inventory/warehouses?type=clinic&active=true
{
  "items": [
    {
      "id": "wh-uuid",
      "tenantId": "tnt-uuid",
      "name": "Merkez Depo",
      "code": "WH-MAIN",
      "type": "general",
      "active": true,
      "createdAt": "2026-07-30T12:00:00.000Z"
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

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Oluştur: `POST /api/v1/inventory/warehouses`
- Detay: `GET /api/v1/inventory/warehouses/{id}`
- AI chunk: `flow-inventory-warehouse`
