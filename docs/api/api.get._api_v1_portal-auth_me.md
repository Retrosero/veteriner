# GET /api/v1/portal-auth/me

Giriş yapmış portal kullanıcısının kimlik bilgilerini döner.
`PortalSessionGuard` ile korunur; cookie veya
`Authorization: Bearer` header zorunlu.

- **Modül:** portal-auth (GOAL-033)
- **Yetki:** `PortalSessionGuard` (portal session).
- **Audit:** Yok (read-only).

**Headers:**

- `Cookie: vetniva_portal_session=<token>` veya
  `Authorization: Bearer <sessionToken>`.

**Response 200 (`PortalUser`):**

```json
{
  "id": "pusr-uuid",
  "tenantId": "tnt-uuid",
  "ownerId": "own-uuid",
  "email": "owner@example.com",
  "displayName": "Ad Soyad",
  "locale": "tr-TR",
  "status": "active",
  "emailVerified": true,
  "emailVerifiedAt": "2026-07-30T10:00:00.000Z",
  "lastLoginAt": "2026-07-30T10:00:00.000Z",
  "createdAt": "2026-07-15T09:00:00.000Z",
  "patientIds": ["pat-uuid-1", "pat-uuid-2"]
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Session yok / süresi dolmuş.
- `VET-PORTAL-0004` (403) — Hesap pasif.
- `VET-PORTAL-0002` (423) — Hesap kilitli (brute-force).

**İlgili dokümanlar:**

- Login: `POST /api/v1/portal-auth/login`
- Logout: `POST /api/v1/portal-auth/logout`
- AI chunk: `flow-portal-auth`
