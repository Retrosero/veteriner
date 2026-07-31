# GET /api/v1/clinic/lab-tests/{id}

ID'ye göre test detayı (referans aralıkları dahil).
Cross-tenant → 404.

- **Modül:** lab-tests
- **Yetki:** `clinic:lab:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`LabTest`):**

`LabTest` şeması için bkz. `POST /api/v1/clinic/lab-tests`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Test bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-test.ts`
- Liste: `GET /api/v1/clinic/lab-tests`
- AI chunk: `flow-lab-test`
