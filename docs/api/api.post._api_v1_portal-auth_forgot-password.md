# POST /api/v1/portal-auth/forgot-password

Parola sıfırlama token'ı talep eder. Email kayıtlıysa sha256-hash'lenen
1 saat geçerli token üretir; response her durumda aynı generic mesaj
döner (email enumeration koruması). FAZ-0'da debug için response'da
`resetToken` döner; FAZ-3+'da bu kaldırılır ve token email ile
gönderilir (GOAL-015 notification entegrasyonu).

- **Modül:** portal-auth
- **Yetki:** public (`@Public()`)
- **Audit:** `audit:portal.auth.password.reset_request` (info) —
  yalnızca email kayıtlıysa.

**Request body (`PortalForgotPasswordRequest`):**

```json
{
  "email": "ayse@example.com",
  "tenantSlug": "vetniva"
}
```

- `email` — RFC 5322; service `trim().toLowerCase()`.
- `tenantSlug` — Opsiyonel (multi-tenant pilot).

**Response 200 (`PortalForgotPasswordResponse`):**

```json
{
  "message": "Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi",
  "resetToken": "fa8b3c...e7d2"
}
```

- `message` — Her durumda aynı generic mesaj.
- `resetToken` — **FAZ-0 debug:** yalnızca email kayıtlıysa düz
  token (128 hex). **FAZ-3+:** kaldırılacak, sıfırlama linki email
  ile gönderilecek.

**Hata kodları:**

- `VET-VALIDATION-0001` (422) — Body parse hatası.

**Güvenlik notları:**

- Email enumeration koruması: response her durumda aynı mesaj.
- Token DB'de sha256 hash olarak saklanır; düz token yalnızca bu
  response'da görünür.
- TTL: 1 saat (`PASSWORD_RESET_TTL_SECONDS=3600`).
- Rate limit: ayrı bir global rate-limit (GOAL-018+) ile
  sınırlandırılacak.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-auth.ts`
- Reset: `POST /api/v1/portal-auth/reset-password`
- AI chunk: `flow-portal-auth`
