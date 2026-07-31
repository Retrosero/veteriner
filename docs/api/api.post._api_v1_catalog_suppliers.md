# POST /api/v1/catalog/suppliers

Yeni tedarikçi oluşturur. `code` tenant-içi benzersiz. `type`:
`clinic` (klinik tedarikçisi — ilaç/aşı) | `petshop` (petshop
tedarikçisi — genel stok) | `general` (her ikisi). `taxId` ve
`contactInfo` opsiyonel.

- **Modül:** suppliers
- **Yetki:** `catalog:supplier:create`
- **Audit:** `audit:supplier.create` (info)

**Request body (`SupplierCreateInput`):**

```json
POST /api/v1/catalog/suppliers
{
  "code": "SUP-NBV-001",
  "name": "Nobivac Türkiye",
  "type": "clinic",
  "taxId": "1234567890",
  "taxOffice": "Beşiktaş",
  "contactInfo": {
    "phone": "+90 212 555 0000",
    "email": "info@nobivac.com.tr",
    "address": "İstanbul, Türkiye"
  },
  "notes": "Aşı tedarikçisi"
}
```

- `code` (string, 1-32, regex `^[A-Za-z0-9_-]+$`) zorunlu.
- `name` (string, 1-200) zorunlu.
- `type` (enum) zorunlu.
- `taxId`, `taxOffice`, `contactInfo`, `notes` opsiyonel.

**Response 201 (`Supplier`):**

```json
{
  "id": "sup-uuid",
  "tenantId": "tnt-uuid",
  "code": "SUP-NBV-001",
  "name": "Nobivac Türkiye",
  "type": "clinic",
  "taxId": "1234567890",
  "taxOffice": "Beşiktaş",
  "contactInfo": { "phone": "...", "email": "..." },
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
- `VET-SUPPLIER-0002` (409) — `code` zaten kayıtlı.

**Tenant izolasyonu:** `code` unique kontrolü tenant-scoped.
SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/supplier.ts`
- Liste: `GET /api/v1/catalog/suppliers`
- Detay: `GET /api/v1/catalog/suppliers/{id}`
- Güncelle: `PATCH /api/v1/catalog/suppliers/{id}`
- Arşivle: `POST /api/v1/catalog/suppliers/{id}/archive`
- AI chunk: `flow-supplier`
- Audit event: `audit:supplier.create`
