# GET /api/v1/clinic/sales/{id}

ID'ye göre klinik satış detayı. Cross-tenant → 404.

- **Modül:** clinic-sales
- **Yetki:** `clinic:payment:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`ClinicSaleDetail`):**

`ClinicSaleDetail` şeması için bkz.
`POST /api/v1/clinic/sales`.

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

- API sözleşmesi: `packages/contracts/src/clinic-sale.ts`
- Liste: `GET /api/v1/clinic/sales`
- AI chunk: `flow-clinic-sale`
