# POST /api/v1/portal-auth/login

Hasta sahibi portal hesabıyla giriş yapar. Başarılı olursa
`vetniva_portal_session` httpOnly cookie set eder + JSON body'de
`sessionToken` + `expiresAt` döner. Brute-force koruması aktif: 5
yanlış deneme sonrası 15 dakika hesap kilidi.

- **Modül:** portal-auth
- **Yetki:** public (`@Public()`)
- **Audit:** `audit:portal.auth.login.success` (info) veya
  `audit:portal.auth.login.failure` (warning; severity `error` ise
  hesap kilitlendi). PII mask'li; `ipAddress` + `userAgentHash`.

**Request body (`PortalLoginRequest`):**

```json
{
  "email": "ayse@example.com",
  "password": "StrongPass123!",
  "tenantSlug": "vetniva"
}
```

- `email` — RFC 5322; service `trim().toLowerCase()`.
- `password` — Plain (hash'lenmemiş); TLS zorunlu.
- `tenantSlug` — Opsiyonel (multi-tenant pilot).

**Response 200 (`PortalSessionResponse`):**

```json
{
  "sessionToken": "uuid-token",
  "expiresAt": "2026-08-29T12:00:00.000Z",
  "portalUser": {
    "id": "pu-uuid",
    "email": "ayse@example.com",
    "displayName": null,
    "locale": "tr-TR",
    "ownerId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "patientIds": []
  },
  "tenant": {
    "id": "tenant-id",
    "slug": "tenant-i",
    "name": "Klinik",
    "country": "TR"
  }
}
```

Cookie: `vetniva_portal_session=<token>; HttpOnly; SameSite=Lax;
Path=/; Max-Age=2592000` (30 gün). Prod'da `Secure`.

**Hata kodları:**

- `VET-VALIDATION-0001` (422) — Body parse hatası.
- `VET-AUTH-0002` (401) — Bilinmeyen email, yanlış parola, veya
  pending_password. Mesaj sabit: "E-posta veya parola hatalı"
  (enumeration koruması).
- `VET-VALIDATION-0003` (422) — `consentKvkk` sentinel kaldırılmış.
- `VET-AUTH-0005` (423) — Hesap kilitli. `details.remainingSeconds`
  ile geri sayım.

**Güvenlik notları:**

- Login hata mesajı sabit (email enumeration koruması).
- Bilinmeyen email için decoy bcrypt hash ile timing eşitlenir.
- 5 yanlış deneme (`MAX_FAILED_LOGIN_COUNT=5`) → 15 dakika kilit
  (`ACCOUNT_LOCK_SECONDS=900`). `status="locked"`,
  `lockedUntil=now+15dk`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-auth.ts`
- AI chunk: `flow-portal-auth`
- Logout: `POST /api/v1/portal-auth/logout`
