# POST /api/v1/kvkk/erasure-requests

KVKK Madde 11 / UK GDPR Madde 17 kapsamında yeni erasure (silme)
talebi oluşturur. Talep `pending` statüsünde döner; SUPERADMIN
`/apply` ile uygulayabilir.

- **Modül:** kvkk
- **Yetki:** `clinic:owner:read` (OWNER, SUPERADMIN) veya
  `kvkk:erasure:read` (SUPERADMIN listeleme/uygulama)
- **Idempotency:** `Idempotency-Key` header opsiyonel; metadata'da
  saklanır (audit trail)
- **Audit:** `audit:kvkk.erasure.requested` (severity: warning)

**Request body (`KvkkErasureRequestInput`):**

```json
{
  "ownerId": "own-uuid",
  "reason": "Sahip KVKK Madde 11 kapsamında silme talep ediyor."
}
```

- `ownerId` — Hasta sahibi UUID'si. Tenant-scoped; başka
  tenant'a ait owner → 403 `VET-KVKK-0004` (bilgi sızdırmaz).
- `reason` — 10-1000 karakter serbest metin gerekçe.

**Response 201 (`KvkkErasureRequest`):**

```json
{
  "id": "kvkk-uuid",
  "tenantId": "tnt-uuid",
  "ownerId": "own-uuid",
  "requestedAt": "2026-08-05T12:00:00.000Z",
  "requestedBy": "usr-uuid",
  "reason": "Sahip KVKK Madde 11 kapsamında silme talep ediyor.",
  "status": "pending",
  "completedAt": null,
  "redactedFields": [],
  "retainedMedicalRecords": 0
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya cross-tenant erasure.
- `VET-KVKK-0004` (403) — Owner bu tenant'a ait değil.
- `VET-VALIDATION-0001` (422) — Validation hatası.

**İlgili dokümanlar:**

- `docs/security/KVKK_DATA_LIFECYCLE.md` (GOAL-126)
- `packages/contracts/src/kvkk.ts`

**Commit:** `feat(api): GOAL-126 KVKK controller + 4 endpoint
(erasure + export)`
