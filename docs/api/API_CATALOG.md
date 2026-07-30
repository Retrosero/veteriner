# API Endpoint Kataloğu (FAZ-1)

> **Otomatik doğrulama:** `pnpm docs:check` her controller için bu
> kataloğa karşılık gelen bir kayıt olmasını zorunlu kılar. Yeni
> endpoint eklerken burada bir bölüm oluşturulmalıdır.

Bu katalog FAZ-1 (platform çekirdeği) kapsamındaki tüm endpoint'leri
içerir. Sonraki fazlarda ilgili modüller eklenecektir.

---

## Tenant (`/api/v1/tenants`)

### POST /api/v1/tenants

Yeni tenant oluşturur. Yalnızca SUPERADMIN.

- **Modül:** tenant
- **Yetki:** `tenant:tenant:create` (SUPERADMIN)
- **Idempotency:** Önerilir (Idempotency-Key header)
- **Audit:** `audit:tenant.create` (severity: critical)

**Request body:**

```json
{
  "slug": "pilot-vet-kadikoy",
  "name": "Pilot Veteriner Kliniği",
  "country": "TR",
  "defaultLocale": "tr-TR",
  "timezone": "Europe/Istanbul",
  "taxId": "1234567890",
  "taxIdType": "company",
  "contactEmail": "info@pilot-vet.com"
}
```

**Response 201:**

```json
{
  "id": "tnt-uuid",
  "slug": "pilot-vet-kadikoy",
  "name": "Pilot Veteriner Kliniği",
  "country": "TR",
  "defaultLocale": "tr-TR",
  "timezone": "Europe/Istanbul",
  "status": "active",
  "taxId": "1234567890",
  "taxIdType": "company",
  "contactEmail": "info@pilot-vet.com",
  "createdAt": "2026-07-30T12:00:00.000Z",
  "updatedAt": "2026-07-30T12:00:00.000Z",
  "archivedAt": null,
  "archivedReason": null
}
```

**Hata kodları:**

- `VET-AUTHZ-0005` — SUPERADMIN gerekli (403)
- `VET-TENANT-0004` — Slug zaten kayıtlı (409)
- `VET-VALIDATION-0003` — Geçersiz format (slug, country) (422)

### GET /api/v1/tenants

Tenant listesi (sayfalı). SUPERADMIN tüm tenant'ları görür; tenant
kullanıcısı yalnızca kendi tenant'ını.

- **Modül:** tenant
- **Yetki:** `tenant:tenant:read` (SUPERADMIN, OWNER)
- **Sorgu:** `page`, `pageSize`, `status`, `country`, `search`

**Response 200:** `{ items: TenantResponse[], total, page, pageSize }`

### GET /api/v1/tenants/:id

Tenant detayı. Cross-tenant denemesi 404 döner (bilgi sızdırmaz).

- **Modül:** tenant
- **Yetki:** `tenant:tenant:read`
- **Hata kodları:** `VET-TENANT-0001` (404), `VET-TENANT-0002` (403, kapalı tenant)

### PATCH /api/v1/tenants/:id

Tenant bilgilerini günceller. SUPERADMIN veya kendi tenant OWNER'ı.

- **Modül:** tenant
- **Yetki:** `tenant:tenant:update`
- **Audit:** `audit:tenant.update` (severity: warning)

### POST /api/v1/tenants/:id/close

Tenant'ı kapatır (soft delete). Yalnızca SUPERADMIN. Fiziksel silme
yok; `status = closed` ve `archivedAt` set edilir.

- **Modül:** tenant
- **Yetki:** `tenant:tenant:archive` (SUPERADMIN)
- **Audit:** `audit:tenant.close` (severity: critical)

**Request body:** `{ "reason": "string (3-500 char)" }`

---

## Branch (`/api/v1/branches` ve `/api/v1/tenants/:tenantId/branches`)

### GET /api/v1/tenants/:tenantId/branches

Tenant'ın şubelerini listeler.

- **Modül:** branch
- **Yetki:** `branch:branch:read` (OWNER, VETERINARIAN, STAFF, SUPERADMIN)
- **Sorgu:** `status` (opsiyonel)
- **RLS:** `app.tenant_id` set edilir; actor.tenantId ile eşleşmeyen
  branch'ler otomatik filtrelenir.

**Response 200:** `{ items: BranchResponse[], total }`

### POST /api/v1/tenants/:tenantId/branches

Yeni şube oluşturur. SUPERADMIN veya tenant OWNER.

- **Modül:** branch
- **Yetki:** `branch:branch:create`
- **Audit:** `audit:branch.create` (severity: info)

**Request body:**

```json
{
  "code": "kadikoy",
  "name": "Kadıköy Şubesi",
  "city": "İstanbul",
  "address": {
    "line1": "Caferağa Mah. Mühürdar Cd.",
    "city": "İstanbul",
    "postalCode": "34710",
    "country": "TR"
  },
  "phone": "+902161234567"
}
```

**Hata kodları:** `VET-AUTHZ-0001` (403), `VET-BRANCH-0003` (409 code çakışma).

### GET /api/v1/branches/:id

Şube detayı. Cross-tenant denemesi 404.

- **Modül:** branch
- **Yetki:** `branch:branch:read`
- **Hata kodları:** `VET-BRANCH-0001` (404)

### PATCH /api/v1/branches/:id

Şube bilgilerini günceller. SUPERADMIN veya tenant OWNER.

- **Modül:** branch
- **Yetki:** `branch:branch:update`
- **Audit:** `audit:branch.update` (severity: info)

### POST /api/v1/branches/:id/archive

Şubeyi arşivler (soft delete). SUPERADMIN veya tenant OWNER.

- **Modül:** branch
- **Yetki:** `branch:branch:archive`
- **Audit:** `audit:branch.update` action: archive (severity: info)

**Request body (opsiyonel):** `{ "reason": "string" }`

**Hata kodları:** `VET-BRANCH-0004` (409 zaten kapalı).

---

## Auth Placeholder (GOAL-010 — kaldırılacak)

GOAL-010'da gerçek auth olmadığından actor bilgisi aşağıdaki
header'lardan okunur. GOAL-011 ile bu header'lar kaldırılır ve
JWT/session tabanlı kimlik doğrulama devreye girer.

| Header          | Açıklama                                | Zorunlu (dev) | Zorunlu (prod) |
| --------------- | --------------------------------------- | ------------- | -------------- |
| `X-Actor-Id`    | Kullanıcı UUID (GOAL-010 placeholder)   | hayır         | hayır (auth zorunlu) |
| `X-Actor-Role`  | SUPERADMIN / OWNER / VETERINARIAN / STAFF (placeholder) | hayır | hayır |
| `X-Tenant-Id`   | Aktif tenant UUID (placeholder)         | hayır         | hayır |
| `X-Branch-Id`   | Aktif şube UUID (placeholder)           | hayır         | hayır |
| `X-Request-Id`  | Correlation ID (UUID v4)                | hayır         | önerilir        |
| `Cookie: vetniva_session=<token>` | GOAL-011 session cookie | hayır | evet |
| `Authorization: Bearer <token>`   | Alternatif: header tabanlı | hayır | evet |

**Güvenlik notu (GOAL-011):** Production'da session cookie / bearer
token zorunlu. `X-Actor-*` header'ları test/dev ortamında fallback
olarak çalışır; production'da yoksayılır. Public endpoint'ler (login,
forgot, reset, accept) için auth gerekmez.

---

## Kimlik Doğrulama (`/api/v1/auth`)

> **GOAL-011 — Kimlik doğrulama ve oturum yönetimi.**
> Session cookie (`vetniva_session`, httpOnly, SameSite=Lax) veya
> `Authorization: Bearer <token>` header ile çalışır. Token DB'de
> SHA-256 hash olarak saklanır; plain token sadece login/reset
> response'unda döner.

### POST /api/v1/auth/login

Personel paneli girişi. Email + parola ile session oluşturur.

- **Modül:** auth
- **Yetki:** public
- **Idempotency:** Hayır
- **Audit:** `audit:auth.login.success` (info) veya `audit:auth.login.failure` (warning/error)
- **Rate limit:** Brute-force koruması (5 deneme / 15 dakika kilit)

**Request body:**

```json
{
  "email": "vet@pilot.com",
  "password": "StrongPass123",
  "tenantSlug": "pilot-vet-kadikoy"
}
```

**Response 200:** `LoginResponse` (sessionToken, expiresAt, user, tenant, role, branchId). Cookie `vetniva_session` set edilir.

**Hata kodları:** `VET-AUTH-0002` (401 — e-posta/parola hatalı, genel mesaj), `VET-AUTH-0003` (423 — kilitli), `VET-VALIDATION-0001` (422).

### POST /api/v1/auth/logout

Mevcut oturumu sona erdirir. Cookie temizlenir.

- **Modül:** auth
- **Yetki:** authenticated
- **Audit:** `audit:auth.logout` (info)

**Response 200:** `{ revokedAt: ISO8601 }`. Cookie silinir.

### POST /api/v1/auth/refresh

Token rotation. Eski session `replacedById` ile yeni session'a bağlanır.

- **Modül:** auth
- **Yetki:** authenticated
- **Audit:** `audit:auth.session.rotate` (info)

**Response 200:** `RefreshResponse` (yeni sessionToken, expiresAt). Cookie güncellenir.

### POST /api/v1/auth/forgot

Parola sıfırlama talebi. Email var/yok bilgisi sızdırılmaz (her zaman 200).

- **Modül:** auth
- **Yetki:** public
- **Audit:** `audit:auth.password.reset_request` (info) — kullanıcı varsa.

**Request body:** `{ "email": "vet@pilot.com" }`
**Response 200:** `{ "message": "Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi" }`

### POST /api/v1/auth/reset

Parola sıfırlama (token + yeni parola). Token tek kullanımlık; başarılı işlemde tüm aktif session'lar iptal edilir.

- **Modül:** auth
- **Yetki:** public
- **Audit:** `audit:auth.password.reset_success` (warning)

**Request body:** `{ "token": "<plain-token-from-email>", "newPassword": "NewPass123" }`
**Response 200:** `ResetPasswordResponse` (message + opsiyonel yeni sessionToken). Yeni cookie set edilir.

**Hata kodları:** `VET-AUTH-0004` (400 — token invalid/kullanılmış/süresi dolmuş), `VET-AUTH-0007` (422 — parola policy), `VET-AUTH-0008` (400 — eski parolayla aynı).

### POST /api/v1/auth/change-password

Oturum açıkken parola değişimi. Eski parola doğrulanır.

- **Modül:** auth
- **Yetki:** authenticated
- **Audit:** `audit:auth.password.change` (info)

**Request body:** `{ "currentPassword": "...", "newPassword": "..." }`
**Response 200:** `{ "message": "Parola güncellendi" }`

### POST /api/v1/auth/invitations

Tenant admin yeni kullanıcıyı tenant'a davet eder. Davet token üretilir; e-posta gönderimi GOAL-015 ile entegre olur (şu an log).

- **Modül:** auth
- **Yetki:** `tenant:tenant:invite` (OWNER / SUPERADMIN)
- **Audit:** `audit:auth.invitation.create` (info)

**Request body:** `{ "email": "...", "role": "STAFF", "message": "opsiyonel" }`
**Response 201:** `InviteUserResponse` (invitationId, email, role, expiresAt, invitationUrl).

**Hata kodları:** `VET-AUTH-0005` (409 — bekleyen davet var), `VET-VALIDATION-0001` (422).

### POST /api/v1/auth/invitations/accept

Davet kabul. Yeni parola oluşturur + User oluşturur + membership atar + otomatik login.

- **Modül:** auth
- **Yetki:** public
- **Audit:** `audit:auth.invitation.accept` (info)

**Request body:** `{ "token": "...", "displayName": "...", "password": "...", "locale": "tr-TR" }`
**Response 200:** `AcceptInvitationResponse` (LoginResponse şeması). Cookie set edilir.

**Hata kodları:** `VET-AUTH-0005` (400 — geçersiz/süresi dolmuş davet).

### POST /api/v1/auth/switch-tenant

Multi-tenant üye kullanıcı için aktif tenant değişimi. Yeni session üretmez.

- **Modül:** auth
- **Yetki:** authenticated
- **Audit:** log'a düşer (actor context değişimi)

**Request body:** `{ "tenantSlug": "..." }`
**Response 200:** `{ "tenantId": "...", "role": "VETERINARIAN" }`

---

## Self-Service (`/api/v1/me`)

> Oturum açmış kullanıcının kendi bilgileri. Tümü auth gerektirir.

### GET /api/v1/me

Aktif kullanıcı + session + üyelikler.

- **Modül:** identity
- **Yetki:** authenticated
- **Response:** `MeResponse` (user, session, tenant, role, branchId, memberships[])

### GET /api/v1/me/sessions

Kullanıcının tüm session'ları (aktif + iptal edilmiş). `isCurrent` bayrağı mevcut oturumu işaretler.

- **Modül:** identity
- **Yetki:** authenticated
- **Response:** `SessionListResponse` (items[])

### DELETE /api/v1/me/sessions/:id

Belirli bir session'ı iptal et (logout-remote). Başka kullanıcının session'ı iptal edilemez (404).

- **Modül:** identity
- **Yetki:** authenticated
- **Audit:** `audit:auth.session.revoke` (info)
- **Response:** `{ "revoked": true }`

---

---

## Ortak hata gövdesi

Tüm endpoint'ler standart `ErrorResponse` döner:

```json
{
  "error_code": "VET-TENANT-0004",
  "message": "Bu tenant slug zaten kayıtlı.",
  "source": "server",
  "severity": "warning",
  "correlation_id": "req-uuid",
  "timestamp": "2026-07-30T12:00:00.000Z",
  "i18n_key": "error.VET-TENANT-0004",
  "details": { "slug": "pilot-vet-kadikoy" }
}
```

Detay için: `docs/errors/ERROR_CODE_STANDARD.md` ve
`docs/errors/ERROR_CATALOG.md`.
