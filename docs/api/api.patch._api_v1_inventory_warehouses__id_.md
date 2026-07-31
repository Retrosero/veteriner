# PATCH /api/v1/inventory/warehouses/{id}

Depo kısmi güncelleme. Yalnız set edilen alanlar değişir.
Arşivli → 409 `VET-INV-0009`. `code` değişirse unique kontrolü
yapılır (`VET-INV-0004`).

- **Modül:** inventory
- **Yetki:** `inventory:warehouse:update`
- **Audit:** `audit:inventory.warehouse.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`WarehouseUpdateInput`):**

```json
PATCH /api/v1/inventory/warehouses/wh-uuid
{
  "name": "Merkez Depo (Yeni)",
  "address": "Yeni adres"
}
```

- Tüm alanlar opsiyonel; en az bir alan set edilmeli.
- `name`, `code` (regex), `type`, `address`, `notes`, `active`.

**Response 200 (`Warehouse`):**

`Warehouse` şeması için bkz. `POST /api/v1/inventory/warehouses`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID veya body parse hatası.
- `VET-INV-0001` (404) — Depo bulunamadı.
- `VET-INV-0004` (409) — Yeni `code` zaten kayıtlı.
- `VET-INV-0009` (409) — Arşivlenmiş kayıt güncellenemez.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before` + `after` snapshot payload'a eklenir;
`code` değişiminde before/after.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Detay: `GET /api/v1/inventory/warehouses/{id}`
- Arşivle: `POST /api/v1/inventory/warehouses/{id}/archive`
- AI chunk: `flow-inventory-warehouse`
- Audit event: `audit:inventory.warehouse.update`
