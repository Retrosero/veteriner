# POST /api/v1/esmm/documents/{id}/submit

Belgeyi GİB'e gönderir (`status='draft'` → `status='pending'`).
Faz 7'de pilot mock; gerçek GİB entegrasyonu Faz 13 (GOAL-130).

- **Modül:** esmm
- **Yetki:** `audit:log:read`
- **Audit:** `audit:esmm.document.submit` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ force?: boolean }` —
`rejected` veya `failed`'i yeniden gönder).

**Response 200 (`EsmmDocument`):**

`EsmmDocument`; `status='pending'`, `submittedAt`,
`submittedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- (404) — Belge bulunamadı.
- (409) — Gönderilemez durumda (`accepted`, `cancelled`).

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Pilot davranış:** mock `submitted` → `accepted` (Faz 7
in-memory); Faz 13+ GİB API gerçek.

**Audit detayı:** `previousStatus` + `force?` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/esmm.ts`
- Detay: `GET /api/v1/esmm/documents/{id}`
- AI chunk: `flow-esmm`
- Audit event: `audit:esmm.document.submit`
