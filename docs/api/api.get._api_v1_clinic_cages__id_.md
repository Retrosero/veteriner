# GET /api/v1/clinic/cages/{id}

ID'ye göre kafes detayı. Cross-tenant → 404.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`Cage`):**

`Cage` şeması için bkz. `POST /api/v1/clinic/cages`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Kafes bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Liste: `GET /api/v1/clinic/cages`
- AI chunk: `flow-hospitalization`
