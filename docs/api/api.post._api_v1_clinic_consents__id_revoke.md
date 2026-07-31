# POST /api/v1/clinic/consents/{id}/revoke

İmzalanmış onam formunu geri çeker. `status='signed'` →
`'revoked'`. `reason` zorunlu. Ameliyat planı zaten
başlatıldıysa ek doğrulama gerekir.

- **Modül:** consents
- **Yetki:** `clinic:consent:revoke` (yüksek yetki)
- **Audit:** `audit:consent.revoke` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ConsentRevokeInput`):**

```json
POST /api/v1/clinic/consents/con-uuid/revoke
{
  "reason": "Hasta sahibi vazgeçti"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`Consent`):**

`Consent`; `status='revoked'`, `revokedAt`, `revokedBy`,
`revokeReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Onam formu bulunamadı.
- (409) — Zaten `revoked` veya `draft` (signed
  olmalı).

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Ameliyat planı etkisi:** `sourceType='surgery_plan'` ise
plan iptal edilir (GOAL-080 cancel otomatik tetiklenir).

**Audit detayı:** `reason` + `previousStatus` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/consent.ts`
- Ameliyat: `flow-surgery-plan` (GOAL-080)
- AI chunk: `flow-consent`
- Audit event: `audit:consent.revoke`
