# GET /api/v1/clinic/hospitalizations/{id}

ID'ye göre yatış detayı. Cross-tenant → 404.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`Hospitalization`):**

`Hospitalization` şeması için bkz.
`POST /api/v1/clinic/hospitalizations`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Yatış bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Liste: `GET /api/v1/clinic/hospitalizations`
- AI chunk: `flow-hospitalization`
