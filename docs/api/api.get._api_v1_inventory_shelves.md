# GET /api/v1/inventory/shelves

Tenant-scoped raf arama. `warehouseId` filtresi ile belirli
bir depoya ait raflar döner. Arşivlenmiş raflar default
dönmez.

- **Modül:** inventory
- **Yetki:** `inventory:shelf:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`ShelfFilters`):**

- `warehouseId` (string) opsiyonel — belirli bir deponun
  rafları.
- `temperatureZone` (enum) opsiyonel.
- `active` (boolean) opsiyonel, default `true`.
- `search` (string, 1-200) opsiyonel — `name` veya `code`.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`ShelfListResponse`):**

```json
GET /api/v1/inventory/shelves?warehouseId=wh-uuid
{
  "items": [
    {
      "id": "sh-uuid",
      "warehouseId": "wh-uuid",
      "name": "Soğuk Oda / Raf A",
      "code": "SH-COLD-A",
      "temperatureZone": "cold",
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

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Oluştur: `POST /api/v1/inventory/shelves`
- AI chunk: `flow-inventory-shelf`
