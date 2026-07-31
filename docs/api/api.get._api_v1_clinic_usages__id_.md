# GET /api/v1/clinic/usages/{id}

ID'ye göre tek klinik tüketim kaydı getirir. Cross-tenant
→ 404.

- **Modül:** clinical-usages
- **Yetki:** `clinic:stock:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`ClinicalUsage`):**

`ClinicalUsage` şeması için bkz. `POST /api/v1/clinic/usages`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Tüketim kaydı bulunamadı (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinical-usage.ts`
- Liste: `GET /api/v1/clinic/usages`
- AI chunk: `flow-clinical-usage`
