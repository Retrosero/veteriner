# POST /api/v1/inventory/warehouses/{id}/archive

Depoyu soft delete ile arşivler. Aktif raf varsa 409
`VET-INV-0010` (önce rafları arşivleyin). Geçmiş stok
hareketleri audit trail'de korunur.

- **Modül:** inventory
- **Yetki:** `inventory:warehouse:archive` (yüksek yetki)
- **Audit:** `audit:inventory.warehouse.archive` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`WarehouseArchiveInput`):**

```json
POST /api/v1/inventory/warehouses/wh-uuid/archive
{
  "reason": "Taşınma — yeni adres"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`Warehouse`):**

`Warehouse` şeması için bkz. `POST /api/v1/inventory/warehouses`;
`archivedAt`, `archivedBy`, `archiveReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-INV-0001` (404) — Depo bulunamadı.
- `VET-INV-0010` (409) — Aktif raf var; önce rafları arşivleyin.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `reason` + `activeShelvesCount` payload'a
eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Detay: `GET /api/v1/inventory/warehouses/{id}`
- AI chunk: `flow-inventory-warehouse`
- Audit event: `audit:inventory.warehouse.archive`
