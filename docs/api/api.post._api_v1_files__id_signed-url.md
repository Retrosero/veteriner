# POST /api/v1/files/:id/signed-url

Kısa ömürlü (5-60 dk) imzalı indirme URL'i üretir. Storage backend
(S3 / Local) imzalı token üretir. Cross-tenant veya arşivlenmiş
dosya için 404 (`VET-FILE-0001`).

- **Modül:** file
- **Yetki:** `file:file:read`
- **Audit:** `audit:file.signed_url` (info)

**Path parametreleri:**

- `id` (UUID, zorunlu) — dosya ID'si

**Request body (opsiyonel):**

```json
{ "ttlSeconds": 300 }
```

- `ttlSeconds` — Default 300 (5 dk); min 60, max 3600.

**Response 200:**

```json
{
  "url": "https://storage.vetniva.local/...?token=...",
  "expiresAt": "2026-07-30T12:05:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401), `VET-AUTHZ-0001` (403)
- `VET-FILE-0001` (404) — dosya bulunamadı / arşivlenmiş
- `VET-FILE-0004` (403) — karantina (infected)
