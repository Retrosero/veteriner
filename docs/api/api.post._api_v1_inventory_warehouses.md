# POST /api/v1/inventory/warehouses

Tenant-scoped yeni depo oluşturur. `code` tenant-içi benzersiz
olmalıdır; duplicate → 409 `VET-INV-0004`. `type`:
`clinic` (ilaç/aşı saklama) | `petshop` (genel stok) |
`general` (varsayılan).

- **Modül:** inventory
- **Yetki:** `inventory:warehouse:create`
- **Audit:** `audit:inventory.warehouse.create` (info)

**Request body (`WarehouseCreateInput`):**

```json
POST /api/v1/inventory/warehouses
{
  "name": "Merkez Depo",
  "code": "WH-MAIN",
  "type": "general",
  "address": "Atatürk Cad. No:1 İstanbul",
  "notes": "Ana klinik deposu"
}
```

- `name` (string, 1-200) zorunlu.
- `code` (string, 1-32, regex `^[A-Za-z0-9_-]+$`) zorunlu.
- `type` (enum) opsiyonel, default `general`.
- `address` (string, ≤500) opsiyonel.
- `notes` (string, ≤2000) opsiyonel.

**Response 201 (`Warehouse`):**

```json
{
  "id": "wh-uuid",
  "tenantId": "tnt-uuid",
  "name": "Merkez Depo",
  "code": "WH-MAIN",
  "type": "general",
  "address": "Atatürk Cad. No:1 İstanbul",
  "notes": "Ana klinik deposu",
  "active": true,
  "createdAt": "2026-07-30T12:00:00.000Z",
  "createdBy": "usr-uuid",
  "updatedAt": "2026-07-30T12:00:00.000Z",
  "archivedAt": null,
  "archivedBy": null,
  "archiveReason": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-INV-0004` (409) — `code` zaten kayıtlı.

**Tenant izolasyonu:** `code` unique kontrolü tenant-scoped.
SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Liste: `GET /api/v1/inventory/warehouses`
- Detay: `GET /api/v1/inventory/warehouses/{id}`
- Güncelle: `PATCH /api/v1/inventory/warehouses/{id}`
- Arşivle: `POST /api/v1/inventory/warehouses/{id}/archive`
- Raf: `POST /api/v1/inventory/shelves`
- AI chunk: `flow-inventory-warehouse`
- Audit event: `audit:inventory.warehouse.create`
