# GET /api/v1/pricing/lists/{id}

ID'ye göre fiyat listesi detayı. Cross-tenant → 404.

- **Modül:** pricing
- **Yetki:** `pricing:price_list:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`PriceList`):**

`PriceList` şeması için bkz. `POST /api/v1/pricing/lists`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-PRICING-0001` (404) — Liste bulunamadı (cross-tenant
  dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Liste: `GET /api/v1/pricing/lists`
- AI chunk: `flow-pricing`
