# GET /api/v1/clinic/lab-orders/{id}

ID'ye göre lab order detayı. Cross-tenant → 404.

- **Modül:** lab-orders
- **Yetki:** `clinic:lab:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`LabOrder`):**

`LabOrder` şeması için bkz. `POST /api/v1/clinic/lab-orders`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Lab order bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-order.ts`
- Liste: `GET /api/v1/clinic/lab-orders`
- AI chunk: `flow-lab-order`
