# GET /api/v1/catalog/suppliers/{id}

ID'ye göre tek tedarikçi getirir. Cross-tenant → 404
`VET-SUPPLIER-0001`.

- **Modül:** suppliers
- **Yetki:** `catalog:supplier:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`Supplier`):**

`Supplier` şeması için bkz. `POST /api/v1/catalog/suppliers`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-SUPPLIER-0001` (404) — Tedarikçi bulunamadı (cross-tenant
  dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/supplier.ts`
- Liste: `GET /api/v1/catalog/suppliers`
- AI chunk: `flow-supplier`
