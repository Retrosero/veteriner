# GET /api/v1/clinic/imaging-orders/{id}

ID'ye göre görüntüleme detayı. Cross-tenant → 404.

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`ImagingOrder`):**

`ImagingOrder` şeması için bkz.
`POST /api/v1/clinic/imaging-orders`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Order bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- Liste: `GET /api/v1/clinic/imaging-orders`
- AI chunk: `flow-imaging-order`
