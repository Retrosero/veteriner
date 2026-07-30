# GET /api/v1/me/sessions

> **Modül:** identity
> **Yetki:** authenticated
> **Auth:** Session cookie veya `Authorization: Bearer <token>`
> **Hata kodları:** `VET-AUTH-0001` (401)

Kullanıcının tüm oturumlarını listeler (aktif + iptal edilmiş).
`isCurrent` bayrağı mevcut oturumu işaretler. Mevcut cihazdaki
oturum için `true` döner.

**Response 200:** `SessionListResponse`

```json
{
  "items": [
    {
      "id": "uuid",
      "expiresAt": "2026-08-29T10:00:00.000Z",
      "lastUsedAt": "2026-07-30T10:00:00.000Z",
      "createdAt": "2026-07-25T10:00:00.000Z",
      "ipAddress": "192.168.1.***",
      "isCurrent": true,
      "revokedAt": null
    },
    {
      "id": "uuid",
      "expiresAt": "2026-08-15T10:00:00.000Z",
      "lastUsedAt": "2026-07-20T15:00:00.000Z",
      "createdAt": "2026-07-15T10:00:00.000Z",
      "ipAddress": "10.0.0.***",
      "isCurrent": false,
      "revokedAt": "2026-07-25T10:00:00.000Z"
    }
  ]
}
```

**Kullanım:** Şüpheli oturum tespit edilirse `DELETE /me/sessions/:id`
ile uzaktan kapatılabilir.

**İlgili dokümanlar:**
- API sözleşmesi: `packages/contracts/src/auth.ts` (`sessionListItemSchema`)
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (UserSession)
