# GET /api/v1/clinic/consents/{id}

ID'ye göre onam formu detayı (şablon render dahil).
Cross-tenant → 404.

- **Modül:** consents
- **Yetki:** `clinic:consent:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`Consent`):**

`Consent` şeması için bkz. `POST /api/v1/clinic/consents`;
şablon render + imza metadata dahil.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Onam formu bulunamadı (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/consent.ts`
- Liste: `GET /api/v1/clinic/consents`
- AI chunk: `flow-consent`
