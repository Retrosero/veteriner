# POST /api/v1/esmm/documents/{id}/cancel

Belgeyi iptal eder. Yalnız `draft`/`pending`/`rejected`/
`failed` durumda iptal edilir. `accepted` → 409 (GİB
tarafından kabul edilmiş, iptal ancak iade/adisyon ile).

- **Modül:** esmm
- **Yetki:** `audit:log:read`
- **Audit:** `audit:esmm.document.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`EsmmDocumentCancelInput`):**

```json
POST /api/v1/esmm/documents/esmm-uuid/cancel
{
  "reason": "Müşteri vazgeçti"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`EsmmDocument`):**

`EsmmDocument`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Belge bulunamadı.
- (409) — İptal edilemez (`accepted`).

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `previousStatus` + `reason` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/esmm.ts`
- Detay: `GET /api/v1/esmm/documents/{id}`
- AI chunk: `flow-esmm`
- Audit event: `audit:esmm.document.cancel`
