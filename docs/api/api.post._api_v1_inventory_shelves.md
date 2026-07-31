# POST /api/v1/inventory/shelves

Belirli bir depoya yeni raf ekler. `code` verildiyse
depo-içi benzersiz olmalıdır. Arşivlenmiş depoya raf
eklenemez (409 `VET-INV-0008`).

- **Modül:** inventory
- **Yetki:** `inventory:shelf:create`
- **Audit:** `audit:inventory.shelf.create` (info)

**Request body (`ShelfCreateInput`):**

```json
POST /api/v1/inventory/shelves
{
  "warehouseId": "wh-uuid",
  "name": "Soğuk Oda / Raf A",
  "code": "SH-COLD-A",
  "temperatureZone": "cold",
  "notes": "Aşı saklama"
}
```

- `warehouseId` (string) zorunlu.
- `name` (string, 1-200) zorunlu.
- `code` (string, regex) opsiyonel; verildiyse depo-içi
  benzersiz.
- `temperatureZone` (enum: `room|cold|freezer`) opsiyonel,
  default `room`.
- `notes` (string, ≤2000) opsiyonel.

**Response 201 (`Shelf`):**

```json
{
  "id": "sh-uuid",
  "tenantId": "tnt-uuid",
  "warehouseId": "wh-uuid",
  "name": "Soğuk Oda / Raf A",
  "code": "SH-COLD-A",
  "temperatureZone": "cold",
  "notes": "Aşı saklama",
  "active": true,
  "createdAt": "2026-07-30T12:00:00.000Z",
  "createdBy": "usr-uuid",
  "updatedAt": "2026-07-30T12:00:00.000Z",
  "archivedAt": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-INV-0001` (404) — Depo bulunamadı.
- `VET-INV-0005` (409) — `code` depoda zaten mevcut.
- `VET-INV-0008` (409) — Arşivlenmiş depoya raf eklenemez.

**Tenant izolasyonu:** `warehouseId` tenant-scoped. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Liste: `GET /api/v1/inventory/shelves`
- Detay: `GET /api/v1/inventory/shelves/{id}`
- Güncelle: `PATCH /api/v1/inventory/shelves/{id}`
- Arşivle: `POST /api/v1/inventory/shelves/{id}/archive`
- AI chunk: `flow-inventory-shelf`
- Audit event: `audit:inventory.shelf.create`
