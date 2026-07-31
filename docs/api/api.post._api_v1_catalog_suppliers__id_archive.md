# POST /api/v1/catalog/suppliers/{id}/archive

Tedarikçiyi soft delete ile arşivler. Zaten arşivli → 409
`VET-SUPPLIER-0003`. Geçmiş satın alma siparişleri (PO)
referansı korunur (FK kırılmaz).

- **Modül:** suppliers
- **Yetki:** `catalog:supplier:archive` (yüksek yetki)
- **Audit:** `audit:supplier.archive` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`SupplierArchiveInput`):**

```json
POST /api/v1/catalog/suppliers/sup-uuid/archive
{
  "reason": "Sözleşme sona erdi"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`Supplier`):**

`Supplier` şeması; `archivedAt`, `archivedBy`, `archiveReason`
set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-SUPPLIER-0001` (404) — Tedarikçi bulunamadı.
- `VET-SUPPLIER-0003` (409) — Zaten arşivlenmiş.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `reason` + aktif PO sayısı payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/supplier.ts`
- Detay: `GET /api/v1/catalog/suppliers/{id}`
- AI chunk: `flow-supplier`
- Audit event: `audit:supplier.archive`
