# PATCH /api/v1/inventory/shelves/{id}

Raf kısmi güncelleme. Arşivli → 409 (raf arşivliyse
güncellenemez). `code` değişirse depo-içi unique kontrolü.

- **Modül:** inventory
- **Yetki:** `inventory:shelf:update`
- **Audit:** `audit:inventory.shelf.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ShelfUpdateInput`):**

```json
PATCH /api/v1/inventory/shelves/sh-uuid
{
  "name": "Soğuk Oda / Raf A (Genişletildi)",
  "temperatureZone": "freezer"
}
```

- Tüm alanlar opsiyonel; en az bir alan set edilmeli.
- `name`, `code` (regex), `temperatureZone`, `notes`, `active`.

**Response 200 (`Shelf`):**

`Shelf` şeması için bkz. `POST /api/v1/inventory/shelves`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-INV-0002` (404) — Raf bulunamadı.
- `VET-INV-0005` (409) — Yeni `code` depoda zaten mevcut.
- `VET-INV-0009` (409) — Arşivlenmiş kayıt güncellenemez.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before` + `after` snapshot; `code` değişiminde
before/after.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Detay: `GET /api/v1/inventory/shelves/{id}`
- AI chunk: `flow-inventory-shelf`
- Audit event: `audit:inventory.shelf.update`
