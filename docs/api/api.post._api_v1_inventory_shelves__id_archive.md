# POST /api/v1/inventory/shelves/{id}/archive

Rafı soft delete ile arşivler. Aktif lot varsa 409
`VET-INV-0010` (önce lotları arşivleyin). Geçmiş stok
hareketleri audit trail'de korunur.

- **Modül:** inventory
- **Yetki:** `inventory:shelf:archive` (yüksek yetki)
- **Audit:** `audit:inventory.shelf.archive` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ShelfArchiveInput`):**

```json
POST /api/v1/inventory/shelves/sh-uuid/archive
{
  "reason": "Yeniden düzenleme"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`Shelf`):**

`Shelf` şeması; `archivedAt`, `archivedBy`, `archiveReason`
set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-INV-0002` (404) — Raf bulunamadı.
- `VET-INV-0010` (409) — Aktif lot var; önce lotları arşivleyin.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `reason` + `activeLotsCount` payload'a
eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Detay: `GET /api/v1/inventory/shelves/{id}`
- AI chunk: `flow-inventory-shelf`
- Audit event: `audit:inventory.shelf.archive`
