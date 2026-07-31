# POST /api/v1/superadmin/error-events/{id}/notes

Hata olayına yeni bir çözüm notu ekler. `authorId` ve
`authorType` aktör bağlamından türetilir. `body` PII
mask'lı saklanır.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:error_event.note_added` (info).

**Path parametreleri:**

- `id` (string) zorunlu.

**Body (`ErrorEventNoteCreateInput`):**

```json
{
  "body": "Provider tarafında rate limit düşürüldü; izleniyor.",
  "visibility": "internal"
}
```

- `body` (string, 1-4000) zorunlu.
- `visibility` (enum: internal|shared) zorunlu.
  - `internal`: yalnızca SUPERADMIN görür.
  - `shared`: gelecekte tenant yöneticileriyle paylaşım için
    rezerve (FAZ-12+).

**Response 201 (`ErrorEventNote`):**

```json
{
  "id": "note-0000000001",
  "fingerprint": "deadbeef01234567",
  "authorId": "sa-001",
  "authorType": "user",
  "body": "Provider tarafında rate limit düşürüldü; izleniyor.",
  "visibility": "internal",
  "createdAt": "2026-07-31T16:30:00.000Z"
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 422 `VET-VALIDATION-0001` — Geçersiz not içeriği.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
