# POST /api/v1/kvkk/erasure-requests/{id}/apply

Erasure talebini uygular. PII alanları (firstName, lastName, email,
phone, taxId, address) `kvkk-erased-<hash>` formatında
anonimleştirilir. Tıbbi kayıtlar (muayene, aşı, reçete) yasal
saklama süresince (7 yıl) korunur.

- **Modül:** kvkk
- **Yetki:** `kvkk:erasure:read` (SUPERADMIN)
- **Audit:** `audit:kvkk.erasure.applied` (severity: warning)

**Path parametreleri:**

- `id` (UUID) — Erasure talebi ID'si.

**Response 200 (`KvkkErasureApplyResponse`):**

```json
{
  "redacted": ["firstName", "lastName", "email", "phone", "taxId", "address"],
  "retained": 0
}
```

- `redacted` — Anonimleştirilen PII alanları.
- `retained` — Yasal saklama nedeniyle tutulan tıbbi kayıt sayısı
  (Examination, Vaccination, Prescription).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — SUPERADMIN değil.
- `VET-KVKK-0001` (404) — Talep bulunamadı.
- `VET-KVKK-0002` (409) — Talep zaten işlenmiş (`completed` veya
  `rejected`).
- `VET-KVKK-0003` (500) — Anonimleştirme başarısız.

**İlgili dokümanlar:**

- `docs/security/KVKK_DATA_LIFECYCLE.md` (GOAL-126)
- `packages/contracts/src/kvkk.ts`
