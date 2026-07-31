# GET /api/v1/clinic/hospitalization-orders/{id}

ID'ye göre yatış order detayı. Cross-tenant → 404.

- **Modül:** hospitalization-orders
- **Yetki:** `clinic:hospitalization:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`HospitalizationOrder`):**

`HospitalizationOrder` şeması için bkz.
`POST /api/v1/clinic/hospitalization-orders`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Order bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization-order.ts`
- Liste: `GET /api/v1/clinic/hospitalization-orders`
- AI chunk: `flow-hospitalization-order`
