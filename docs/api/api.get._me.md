# GET /api/v1/me

> **Modül:** identity
> **Yetki:** authenticated
> **Auth:** Session cookie veya `Authorization: Bearer <token>`
> **Hata kodları:** `VET-AUTH-0001` (401)

Aktif kullanıcı + session + üyelikler.

**Response 200:** `MeResponse`

```json
{
  "user": {
    "id": "uuid",
    "email": "vet@pilot.com",
    "displayName": "Dr. Pilot",
    "locale": "tr-TR",
    "status": "active",
    "lastLoginAt": "2026-07-30T10:00:00.000Z",
    "passwordChangedAt": "2026-07-01T08:00:00.000Z"
  },
  "session": {
    "id": "uuid",
    "expiresAt": "2026-08-29T10:00:00.000Z",
    "lastUsedAt": "2026-07-30T10:00:00.000Z",
    "ipAddress": "192.168.1.***"
  },
  "tenant": null,
  "role": null,
  "branchId": null,
  "memberships": [
    {
      "tenantId": "uuid",
      "tenantSlug": "pilot-vet",
      "tenantName": "Pilot Veteriner",
      "role": "OWNER",
      "status": "active"
    }
  ]
}
```

**Audit:** Aktif session kullanımı (lastUsedAt güncellenir).

**İlgili dokümanlar:**
- API sözleşmesi: `packages/contracts/src/auth.ts` (`meResponseSchema`)
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (User, UserSession)
