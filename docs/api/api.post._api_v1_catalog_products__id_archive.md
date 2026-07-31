# POST /api/v1/catalog/products/{id}/archive

Ürünü soft delete ile arşivler. `archivedAt` set edilir; kayıt
repo'da korunur. Zaten arşivlenmiş kayıt → 409
`VET-PRODUCT-0003`. Geçmiş satış/alış hareketleri audit
trail'de korunur (FK kırılmaz).

- **Modül:** products
- **Yetki:** `catalog:product:archive` (yüksek yetki)
- **Audit:** `audit:product.archive` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ProductArchiveInput`):**

```json
POST /api/v1/catalog/products/prd-uuid/archive
{
  "reason": "Üretici tarafından üretimden kaldırıldı"
}
```

- `reason` (string, 1-500) zorunlu — denetim için.

**Response 200 (`Product`):**

```json
{
  "id": "prd-uuid",
  "tenantId": "tnt-uuid",
  "name": "Amoksisilin 250 mg",
  "archivedAt": "2026-07-30T12:00:00.000Z",
  "archivedBy": "usr-uuid",
  "archiveReason": "Üretici tarafından üretimden kaldırıldı",
  "updatedAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID veya body parse hatası.
- `VET-PRODUCT-0001` (404) — Ürün bulunamadı.
- `VET-PRODUCT-0003` (409) — Zaten arşivlenmiş.

**Tenant izolasyonu:** `actor.tenantId` zorunlu; service
`requireTenantScope` ile tenant doğrular. Cross-tenant id → 404.
SUPERADMIN bypass'lı.

**Audit detayı:**

- `before` (archivedAt=null) + `after` (archivedAt=now).
- `reason` payload'a eklenir.

**FK / Geçmiş:**

- Arşivlenmiş ürünler `archivedAt != null` olarak tutulur;
  listeleme default `active=true` filtresi ile arşivleri
  göstermez.
- Stok/PO/satış kayıtları `productId` referansı FK kırılmaz
  (audit trail + geçmiş raporları için kritik).
- Re-archive (un-archive) endpoint'i YOK; yeni ürün oluşturulur.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/product.ts`
- Detay: `GET /api/v1/catalog/products/{id}`
- AI chunk: `flow-product-catalog`
- Audit event: `audit:product.archive`
