# GOAL-033 Completion Report — Hasta sahibi portal kayıt ve giriş

- Goal no: GOAL-033
- Başlık: Hasta sahibi portal hesap kayıt ve giriş
- Faz: FAZ-3 (Randevu + portal)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 23fb7a8

## Yapılan işler (core, 23fb7a8)

**PortalAuthService**
(`apps/api/src/modules/portal-auth/portal-auth.service.ts`) — 6 public
metot. (1) `register(tenantId, input, ctx)`: KVKK consent zorunlu
(true değilse 422 `VET-VALIDATION-0003`); email normalize
(`trim().toLowerCase()`); aynı email kayıtlıysa 409 `VET-AUTH-0003`;
bcrypt cost 12 ile hash; status=`active`; audit
`audit:portal.auth.register` (info). (2) `login(tenantId, input, ip,
ua)`: bilinmeyen email için timing-equalize (decoy hash) + generic
401 `VET-AUTH-0002`; hesap kilitliyse 423 `VET-AUTH-0005`; consent
yoksa 422; pending_password ise generic 401; 5 yanlış deneme sonrası
423 + `lockedUntil=now+15dk` (`MAX_FAILED_LOGIN_COUNT=5`,
`ACCOUNT_LOCK_SECONDS=900`); başarıda `failedLoginCount=0`, 30 gün
TTL `PORTAL_SESSION_TTL_SECONDS=2592000`; audit
`audit:portal.auth.login.success|failure`. (3) `validateSession(token)`:
süresi geçmişse siler, null döner. (4) `logout(token, ctx)`: session
yoksa idempotent no-op; audit `audit:portal.auth.logout`. (5)
`requestPasswordReset(tenantId, email, ctx)`: email yoksa generic
mesaj (enumeration koruması); varsa sha256 hash + 1 saat TTL
(`PASSWORD_RESET_TTL_SECONDS=3600`); response debug amaçlı plain
token (FAZ-3+'da email); audit
`audit:portal.auth.password.reset_request`. (6)
`confirmPasswordReset(token, newPassword, ctx)`: token
hash/süre/kullanım kontrolü; yoksa 400 `VET-AUTH-0004`; user varsa
bcrypt rehash + sayacı sıfırla; token consume; audit
`audit:portal.auth.password.reset_success`.

**PortalAuthController** — 5 endpoint (`.controller.ts`), hepsi
`@Public()`:

- `POST /api/v1/portal-auth/register` — 201, `vetniva_portal_session` cookie yok.
- `POST /api/v1/portal-auth/login` — 200, `vetniva_portal_session` cookie set (httpOnly, SameSite=Lax, secure prod).
- `POST /api/v1/portal-auth/logout` — 200, idempotent; cookie clear.
- `POST /api/v1/portal-auth/forgot-password` — 200, generic message.
- `POST /api/v1/portal-auth/reset-password` — 200.
  Tenant çözümlemesi: `x-tenant-slug` veya `x-tenant-id` header
  (pilot). `ZodValidationPipe` ile body doğrulama.

**Sözleşme** (`packages/contracts/src/portal-auth.ts`) — Zod şemaları:
`portalRegisterRequestSchema` (consentKvkk zorunlu, passwordPolicySchema),
`portalLoginRequestSchema`, `portalForgotPasswordRequestSchema`,
`portalResetPasswordRequestSchema`, `portalUserSchema`,
`portalSessionResponseSchema`; sabitler:
`PORTAL_SESSION_COOKIE_NAME`, `PORTAL_SESSION_TTL_SECONDS`,
`PORTAL_SESSION_IDLE_TIMEOUT_SECONDS`, `MAX_FAILED_LOGIN_COUNT`,
`ACCOUNT_LOCK_SECONDS`, `PASSWORD_RESET_TTL_SECONDS`, `BCRYPT_COST`.

**13 yeni test** (`portal-auth.service.spec.ts`): (1) register başarı

- audit, (2) duplicate email → 409, (3) consent false → 422, (4)
  login başarı + session, (5) yanlış parola → counter++, (6) 5 yanlış
  → lock 423, (7) locked hesapla login → 423, (8) valid token → user,
  (9) invalid token → null, (10) logout → session silinir, (11)
  forgot → token + audit, (12) confirm reset → yeni parola, (13)
  invalid reset token → 400.

## Tasarım kararları

- **Personel auth'undan ayrı path:** Cookie adı `vetniva_portal_session`;
  session tipi `portal_session`; `actorType="portal_user"`. Staff
  Guard kullanılmaz, `@Public()` decorator ile public.
- **bcrypt cost 12:** `BCRYPT_COST` constant; plain parola asla
  loglanmaz. Test'lerde gerçek bcryptjs çalışır (~150ms/test).
- **Brute-force:** 5 yanlış deneme (`MAX_FAILED_LOGIN_COUNT`) → 15
  dakika kilit (`ACCOUNT_LOCK_SECONDS=900`). Kilit aktifken 423
  `VET-AUTH-0005`; `remainingSeconds` payload'da döner.
- **Email enumeration koruması:** Login hata mesajı sabit
  ("E-posta veya parola hatalı"). Forgot password her durumda aynı
  generic 200 döner; token yalnızca kullanıcı varsa üretilir.
- **Timing-equalize:** Bilinmeyen email için decoy hash
  (`hashPassword("decoy-password-for-timing-equalization")`) →
  bilinen/bilinmeyen kullanıcı response süresi eşitlenir.
- **Token hash'leme:** Reset token plain olarak response'a döner
  (FAZ-0 debug), DB'de sha256 ile saklanır. 1 saat TTL + tek
  kullanımlık (`consumeResetToken`).
- **30 gün session + 24 saat idle:** TTL hard; idle timeout
  (`lastActivityAt`) FAZ-0'da set edilir, kontrol
  `validateSession`/`me` endpoint'inde (FAZ-3+).
- **KVKK consent:** `consentKvkk: z.literal(true)` (Zod literal);
  register'da ek kontrol. Login'de sentinel (consent kaldırıldıysa
  422).
- **Audit:** 6 event name; tüm auth event'leri PII mask'li (email
  payload'da mask'lenir); `ipAddress` + `userAgentHash` (sha256-32)
  ile correlation. Severity: success=info, failure=warning, lock=error.

## Değişen dosyalar

**Core (23fb7a8):** `apps/api/src/modules/portal-auth/{portal-auth.module,
portal-auth.controller,portal-auth.service,portal-auth.repository,
portal-auth.types,portal-auth.service.spec,index}.ts`,
`packages/contracts/src/{portal-auth,index}.ts`,
`apps/api/src/app.module.ts`.

**Docs & i18n (bu commit):** `goals/GOAL-033_COMPLETION_REPORT.md`
(bu dosya), `PROJECT_CONTEXT.md` (⏳ → ✅), 5 API doc
(`docs/api/api.post._api_v1_portal-auth_*.md`), `docs/ai/AI_CHUNKS.yaml`
(+1 chunk: `flow-portal-auth`). VET-AUTH-0003/0005 katalog ve i18n
mevcut (`docs/errors/ERROR_CATALOG.md`,
`packages/i18n/src/locales/{tr-TR,en-GB}.json`) — değişiklik yok.

## Veritabanı

Yok. In-memory `PortalAuthRepository` (Map). Production'a geçişte
`portal_users` (`tenantId, email` unique), `portal_sessions`
(`token` unique, `expiresAt` index), `portal_password_resets`
(`tokenHash` unique, `expiresAt` index) tabloları + tenant-scoped
index'ler.

## API

| Method | Path                                | Auth   | Kod |
| ------ | ----------------------------------- | ------ | --- |
| POST   | /api/v1/portal-auth/register        | public | 201 |
| POST   | /api/v1/portal-auth/login           | public | 200 |
| POST   | /api/v1/portal-auth/logout          | public | 200 |
| POST   | /api/v1/portal-auth/forgot-password | public | 200 |
| POST   | /api/v1/portal-auth/reset-password  | public | 200 |

Hatalar: 422 `VET-VALIDATION-0003` (KVKK), 409 `VET-AUTH-0003`
(duplicate email), 401 `VET-AUTH-0002` (login fail), 423
`VET-AUTH-0005` (lock), 400 `VET-AUTH-0004` (reset token invalid),
400 `VET-TENANT-0001` (tenant header yok, register).

## Test

13 yeni unit test. Register 3 (happy + duplicate + consent); login
4 (happy + wrong + lock 5x + locked); session 2 (valid + invalid);
logout 1; forgot 1; reset 2 (success + invalid). Başarısız: 0.

## Bilinen riskler

- In-memory storage (pilot); DB persistence FAZ-3+'da.
- Reset token response'da döner (FAZ-0 debug); FAZ-3+'da email ile
  gönderilecek (notification GOAL-015).
- `displayName`/`patientIds`/`tenant.name` controller tarafında
  hardcoded default; gerçek owner/patient join FAZ-3+'da.
- Idle timeout set edilir ama FAZ-0'da validate edilmez.
- 30 gün TTL — refresh token / sliding window FAZ-3+.

## Sıradaki

FAZ-3 portal. GOAL-034 (portal hayvan listesi/detay), GOAL-035 (online
randevu talebi), GOAL-036 (hatırlatma).
