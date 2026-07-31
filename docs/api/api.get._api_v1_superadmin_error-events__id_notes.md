# GET /api/v1/superadmin/error-events/{id}/notes

Bir hata olayının tüm çözüm notlarını createdAt artan sırada
döner. Append-only; not silinemez veya düzeltilemez
(düzeltme yeni not ile yapılır).

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string) zorunlu.

**Response 200 (`ErrorEventNoteListResponse`):**

```json
{
  "items": [
    {
      "id": "note-0000000001",
      "fingerprint": "deadbeef01234567",
      "authorId": "sa-001",
      "authorType": "user",
      "body": "Provider tarafında rate limit düşürüldü; izleniyor.",
      "visibility": "internal",
      "createdAt": "2026-07-31T16:30:00.000Z"
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
