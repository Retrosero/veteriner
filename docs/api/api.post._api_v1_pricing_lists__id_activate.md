# POST /api/v1/pricing/lists/{id}/activate

Fiyat listesini aktifleştirir. `active=false` → `active=true`.
Aynı `type` + `currency`'deki aktif liste otomatik
deaktive olur (zincir).

- **Modül:** pricing
- **Yetki:** `pricing:price_list:update`
- **Audit:** `audit:price_list.activate` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** yok.

**Response 200 (`PriceList`):**

`PriceList`; `active=true`, `activatedAt`, `activatedBy`
set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-PRICING-0001` (404) — Liste bulunamadı.
- `VET-PRICING-0004` (409) — Arşivli liste aktifleştirilemez.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `deactivatedListIds[]` (zincir) +
`activatedListId` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/pricing.ts`
- Detay: `GET /api/v1/pricing/lists/{id}`
- AI chunk: `flow-pricing`
- Audit event: `audit:price_list.activate`
