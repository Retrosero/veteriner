# POST /api/v1/esmm/documents/{id}/retry

Başarısız belgeyi yeniden gönderir (`status='failed'` →
`'pending'`). Yalnız `failed` veya `rejected` durumda retry
yapılabilir.

- **Modül:** esmm
- **Yetki:** `audit:log:read`
- **Audit:** `audit:esmm.document.retry` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ reason?: string }`).

**Response 200 (`EsmmDocument`):**

`EsmmDocument`; `status='pending'`, `attemptCount++`,
`lastRetryAt` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- (404) — Belge bulunamadı.
- (409) — Retry uygun değil (`accepted`/`cancelled`/
  `pending`).

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `previousStatus` + `attemptCount` +
`reason?` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/esmm.ts`
- Detay: `GET /api/v1/esmm/documents/{id}`
- AI chunk: `flow-esmm`
- Audit event: `audit:esmm.document.retry`
