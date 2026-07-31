# GET /api/v1/clinic/lab-adapter-imports/{id}

ID'ye göre import detayı. Cross-tenant → 404.

- **Modül:** lab-adapters
- **Yetki:** `clinic:lab:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`LabAdapterImport`):**

`LabAdapterImport` şeması için bkz.
`POST .../lab-orders/{labOrderId}/adapter-imports`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Import bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-adapter.ts`
- Liste: `GET .../lab-adapter-imports`
- AI chunk: `flow-lab-adapter`
