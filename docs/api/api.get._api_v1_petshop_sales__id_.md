# GET /api/v1/petshop/sales/{id}

ID'ye göre petshop satış detayı (lines dahil). Cross-tenant
→ 404 `VET-SALE-0001`.

- **Modül:** petshop-sales
- **Yetki:** `petshop:sale:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`PetshopSaleDetail`):**

`PetshopSaleDetail` şeması için bkz.
`POST /api/v1/petshop/sales`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-SALE-0001` (404) — Satış bulunamadı (cross-tenant
  dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale.ts`
- Liste: `GET /api/v1/petshop/sales`
- AI chunk: `flow-petshop-sale`
