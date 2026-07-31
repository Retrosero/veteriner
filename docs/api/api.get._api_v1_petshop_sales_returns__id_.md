# GET /api/v1/petshop/sales/returns/{id}

ID'ye göre petshop satış iadesi detayı (lines dahil).
Cross-tenant → 404 `VET-RETURN-0001`.

- **Modül:** petshop-sale-returns
- **Yetki:** `petshop:sale:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`PetshopSaleReturnDetail`):**

`PetshopSaleReturnDetail` şeması için bkz.
`POST /api/v1/petshop/sales/returns`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-RETURN-0001` (404) — İade bulunamadı (cross-tenant
  dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale-return.ts`
- Liste: `GET /api/v1/petshop/sales/returns`
- AI chunk: `flow-petshop-sale-return`
