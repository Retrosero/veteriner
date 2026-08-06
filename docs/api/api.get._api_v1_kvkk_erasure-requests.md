# GET /api/v1/kvkk/erasure-requests

Erasure taleplerinin tenant-scoped listesini döner. Yalnızca
SUPERADMIN (`kvkk:erasure:read`) erişebilir; tenant dışı talepler
görüntülenmez.

- **Modül:** kvkk
- **Yetki:** `kvkk:erasure:read` (SUPERADMIN)
- **Audit:** Erişim audit log'a yansımaz (salt okuma); ancak
  sayfalama + filtre parametreleri mask'lenir.

**Query parametreleri (`KvkkErasureRequestListQuery`):**

- `status` (opsiyonel) — `pending` | `in_progress` | `completed`
  | `rejected`.
- `ownerId` (opsiyonel) — Hasta sahibi UUID filtresi.
- `limit` (default 20, max 200) — Sayfa boyutu.
- `offset` (default 0, max 10000) — Sayfa başlangıcı.

**Response 200 (`KvkkErasureRequestListResponse`):**

```json
{
  "items": [
    {
      "id": "kvkk-uuid",
      "tenantId": "tnt-uuid",
      "ownerId": "own-uuid",
      "requestedAt": "2026-08-05T12:00:00.000Z",
      "requestedBy": "usr-uuid",
      "reason": "Sahip talebi",
      "status": "pending",
      "completedAt": null,
      "redactedFields": [],
      "retainedMedicalRecords": 0
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — SUPERADMIN değil.
- `VET-VALIDATION-0001` (422) — Geçersiz query parametresi.

**İlgili dokümanlar:**

- `docs/security/KVKK_DATA_LIFECYCLE.md` (GOAL-126)
- `packages/contracts/src/kvkk.ts`
