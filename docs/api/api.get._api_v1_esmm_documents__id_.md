# GET /api/v1/esmm/documents/{id}

ID'ye göre e-SMM belge detayı (lines dahil). Cross-tenant
→ 404.

- **Modül:** esmm
- **Yetki:** `audit:log:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`EsmmDocument`):**

`EsmmDocument` şeması için bkz.
`POST /api/v1/esmm/documents`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Belge bulunamadı (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/esmm.ts`
- Liste: `GET /api/v1/esmm/documents`
- AI chunk: `flow-esmm`
