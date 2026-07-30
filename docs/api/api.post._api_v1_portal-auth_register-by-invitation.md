# POST /api/v1/portal-auth/register-by-invitation

Davet token'ı ile portal hesabı oluşturur. Davet `pending` ve süresi
dolmuş olmamalı; başarıyla oluşturulunca davet `accepted` yapılır.
KVKK açık rızası (`consentKvkk=true`) zorunludur.

- **Modül:** portal-auth (GOAL-033)
- **Yetki:** Public.
- **Audit:** `audit:portal.auth.register` (severity: info) —
  invitationId, ownerId, email, locale.

**Request body (`PortalRegisterByInvitationRequest`):**

```json
{
  "token": "invitation-token-here",
  "email": "owner@example.com",
  "password": "SecurePassword123!",
  "consentKvkk": true,
  "displayName": "Ad Soyad",
  "locale": "tr-TR"
}
```

- `token` (string, zorunlu) — davet token.
- `email` (string, zorunlu) — benzersiz olmalı.
- `password` (string, zorunlu) — parola politikası.
- `consentKvkk` (boolean, zorunlu) — `true` olmalı.
- `displayName` (string, opsiyonel).
- `locale` (enum, opsiyonel) — `tr-TR` (default) | `en-GB`.

**Response 201:**

```json
{
  "user": { "id": "pusr-uuid", "email": "owner@example.com" },
  "emailVerificationToken": "verify-token"
}
```

**Hata kodları:**

- `VET-VALIDATION-0001` / `0002` / `0007` — body parse / eksik alan /
  parola politikası.
- `VET-PORTAL-0001` (400) — Davet geçersiz / süresi dolmuş / iptal.
- `VET-COMMON-0004` (429) — Brute-force / rate limit.

**İlgili dokümanlar:**

- Davet: `POST /api/v1/portal-invitations` (FAZ-2 GOAL-025)
- AI chunk: `flow-portal-invite`, `flow-portal-auth`
