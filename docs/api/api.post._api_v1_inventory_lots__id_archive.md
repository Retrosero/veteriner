# POST /api/v1/inventory/lots/{id}/archive

Lotu soft delete ile arşivler. Aktif stok bakiyesi varsa
uyarı logu yazılır; arşivleme yine de yapılabilir
(geçmiş hareketler korunur). Yeniden aktif etme (un-archive)
YOK; yeni lot oluşturulur.

- **Modül:** inventory
- **Yetki:** `inventory:lot:archive` (yüksek yetki)
- **Audit:** `audit:inventory.lot.archive` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`StockLotArchiveInput`):**

```json
POST /api/v1/inventory/lots/lot-uuid/archive
{
  "reason": "SKT geçti"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`StockLot`):**

`StockLot` şeması; `archivedAt`, `archivedBy`, `archiveReason`
set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-INV-0003` (404) — Lot bulunamadı.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `reason` + aktif bakiye snapshot'ı
(`quantity`) payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Detay: `GET /api/v1/inventory/lots/{id}`
- AI chunk: `flow-inventory-lot`
- Audit event: `audit:inventory.lot.archive`
