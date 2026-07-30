# POST /api/v1/portal-auth/verify-email

Portal hesabının e-posta doğrulama token'ını işler. Token
hash'lenmiş hali DB'de aranır; geçerliyse `emailVerified=true` yapılır
ve `emailVerifiedAt` set edilir.

- **Modül:** portal-auth (GOAL-033)
- **Yetki:** Public.
- **Audit:** `audit:portal.auth.email_verify` (severity: info).

**Request body:**

```json
{ "token": "verify-token-here" }
```

**Response 200:**

```json
{ "verified": true }
```

**Hata kodları:**

- `VET-VALIDATION-0001` / `0002` — body parse / token eksik.
- `VET-AUTH-0001` (401) — Token geçersiz veya süresi dolmuş.
- `VET-COMMON-0004` (429) — Rate limit.

**İlgili dokümanlar:**

- Register: `POST /api/v1/portal-auth/register`,
  `POST /api/v1/portal-auth/register-by-invitation`
- AI chunk: `flow-portal-auth`
