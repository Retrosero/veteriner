# GET /api/v1/inventory/warehouses/{id}

ID'ye göre tek depo getirir. Cross-tenant → 404
`VET-INV-0001`.

- **Modül:** inventory
- **Yetki:** `inventory:warehouse:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`Warehouse`):**

`Warehouse` şeması için bkz. `POST /api/v1/inventory/warehouses`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-INV-0001` (404) — Depo bulunamadı (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Liste: `GET /api/v1/inventory/warehouses`
- AI chunk: `flow-inventory-warehouse`
