# POST /api/v1/clinic/consents/{id}/sign

Onam formunu imzalar. `status='draft'` → `'signed'`.
`signatureMethod`: `wet` (ıslak imza) | `e_signature` (e-imza,
KVKK uyumlu) | `verbal_witness`. İmza kanıtı (IP, UA hash,
timestamp) log'a yazılır.

- **Modül:** consents
- **Yetki:** `clinic:consent:sign`
- **Audit:** `audit:consent.sign` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ConsentSignInput`):**

```json
POST /api/v1/clinic/consents/con-uuid/sign
{
  "signatureMethod": "wet",
  "witnessName": "Dr. Ayşe Yılmaz",
  "notes": "Hasta sahibi okudu, anladı"
}
```

- `signatureMethod` (enum) zorunlu.
- `witnessName` (string) — `verbal_witness` ise zorunlu.
- `notes` (string) opsiyonel.

**Response 200 (`Consent`):**

`Consent`; `status='signed'`, `signedAt`, `signedBy`,
`signatureMethod`, `signatureEvidence` (IP, UA hash,
timestamp, geo-iptional) set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Onam formu bulunamadı.
- (409) — Zaten `signed` veya `revoked`.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Ameliyat planı entegrasyonu:** `sourceType='surgery_plan'`
ise imza sonrası plan başlatılabilir (GOAL-080).

**Audit detayı:** `signatureMethod` + `signatureEvidence`
payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/consent.ts`
- Ameliyat: `flow-surgery-plan` (GOAL-080)
- AI chunk: `flow-consent`
- Audit event: `audit:consent.sign`
