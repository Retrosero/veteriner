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

### POST /api/v1/auth/switch-branch/:branchId

Aktif branch'ı değiştirir (multi-branch tenant). Normal kullanıcı
yalnızca kendi tenant'ının branch'larına geçebilir; SUPERADMIN
herhangi bir tenant'ın branch'ına geçebilir (cross-tenant).

- **Modül:** auth
- **Yetki:** authenticated
- **Audit:** `audit:auth.branch.switch` (info)
- **GOAL:** GOAL-012 (RBAC ve izin motoru)

**Response 200:** `{ "branchId": "uuid" }`

**Hata kodları:** `VET-BRANCH-0001` (404 — şube yok), `VET-AUTHZ-0004`
(403 — farklı tenant branch'ı).

---

## Modül / Feature Flag (`/api/v1/modules`)

> **GOAL-013 — Modül/feature flag altyapısı.** Tenant bazında 10
> iş modülünün (clinic, appointments, vaccinations, inventory,
> petshop, billing, hospitalization, laboratory, imaging, portal)
> enable/disable yönetimi. Persistence: in-memory Map (process-local);
> DB taşıması ileride.

### GET /api/v1/modules

Aktif tenant için tüm modüllerin enable/disable durumunu listeler.
Bilinçli bir disable yoksa `enabled: true` döner.

- **Modül:** feature-flag
- **Yetki:** `tenant:tenant:read` (SUPERADMIN, OWNER)
- **Audit:** yok (salt okunur; PII taşımaz)

**Response 200:** `{ items: Array<{ key: ModuleKey, enabled: boolean }> }`

### PATCH /api/v1/modules/:key

Aktif tenant için verilen modülü açar veya kapatır. Her değişiklik
audit log'a yansır.

- **Modül:** feature-flag
- **Yetki:** `tenant:tenant:update` (SUPERADMIN, OWNER)
- **Audit:** `audit:feature_flag.enable` (info) veya
  `audit:feature_flag.disable` (warning)
- **Parametre:** `key` ∈ `clinic | appointments | vaccinations |
  inventory | petshop | billing | hospitalization | laboratory |
  imaging | portal`

**Request body:** `{ "enabled": boolean }`

**Response 200:** `{ key: ModuleKey, enabled: boolean }`

**Hata kodları:** `VET-AUTHZ-0001` (403 — permission yok),
`VET-AUTHZ-0006` (403 — tenant bağlamı yok),
`VET-VALIDATION-0001` (422 — body şeması hatalı).

Disable edilen bir modüle yapılan sonraki erişim denemeleri
`VET-MODULE-0001` (403) ile reddedilir. SUPERADMIN bu kontrolden
bağımsız geçer (master switch).

---

## Dosya ve Medya (`/api/v1/files`)

> **GOAL-014 — Dosya ve medya servisi.** Hasta fotoğrafı, laboratuvar
> raporu, DICOM, onam formu ve fatura gibi varlıklar için upload,
> meta, download ve arşiv endpoint'leri. MIME whitelist (4 tip) +
> 10 MB boyut sınırı + antivirus pipeline uygulanır. Storage
> `STORAGE_DRIVER` env ile seçilir (`local` veya `s3`). Şu an
> in-memory Map; DB persistence ileride eklenecek.

### POST /api/v1/files

Multipart upload. Body: `file` (binary), `category`,
`relatedEntityType?`, `relatedEntityId?`. Auth + `file:file:upload`.

**Hata kodları:** `VET-FILE-0001` (413 — boyut), `VET-FILE-0002`
(415 — MIME), `VET-FILE-0004` (422 — antivirus),
`VET-AUTHZ-0001` (403 — permission yok),
`VET-AUTHZ-0006` (403 — tenant yok).

**Response 201:** `FileMeta` (id, tenantId, category, mimeType,
sizeBytes, storageKey, uploadedBy, uploadedAt).

**Audit:** `audit:file.upload` (info).

### GET /api/v1/files/:id

Dosya meta verisi. Auth + `file:file:read`.

**Hata kodları:** `VET-FILE-0003` (404 — bulunamadı veya farklı
tenant; ayrım dışarıya sızdırılmaz).

**Response 200:** `FileMeta`.

### GET /api/v1/files/:id/download

Binary stream. Auth + `file:file:read`. Response header'larında
`Content-Type` + `Content-Disposition: attachment; filename=...`.

### DELETE /api/v1/files/:id

Arşivleme (soft delete; fiziksel silme yok). Auth + `file:file:delete`.

**Response:** 204 No Content.

**Audit:** `audit:file.archive` (warning).

### POST /api/v1/files/:id/signed-url

S3 driver seçiliyse geçici imzalı URL (üretimde); stub. Auth +
`file:file:read`.

---

## Bildirim (`/api/v1/notifications`)

> GOAL-015 (Bildirim altyapısı temeli) kapsamında eklenen
> bildirim endpoint'leri. Manuel gönderim + in-app inbox
> sorgusu. Tenant scope zorunlu; cross-tenant denemeler
> reddedilir.

### POST /api/v1/notifications

Manuel bildirim gönderir. Template render + provider dispatch
+ idempotency. Auth + `common:notification:manage`.

- **Modül:** notifications
- **Yetki:** `common:notification:manage`
- **Idempotency:** Önerilir (`Idempotency-Key` header, 24 saat TTL)
- **Audit:** `audit:notification.sent` (info) veya
  `audit:notification.failed` (warning) veya
  `audit:notification.denied` (warning — consent reddi)

**Request body (NotificationRequest):**

```json
{
  "userId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "channel": "sms",
  "category": "appointment",
  "templateKey": "appointment_reminder",
  "locale": "tr-TR",
  "data": {
    "ownerName": "Ayşe Yılmaz",
    "petName": "Karabaş",
    "clinicName": "Kadıköy Veteriner",
    "date": "2026-08-01",
    "time": "14:30"
  },
  "idempotencyKey": "appt-rem-2026-08-01-karabas"
}
```

**Response 200 (NotificationRecord):** Provider dispatch sonucu
(status: `sent` / `queued` / `failed`). Hata durumunda
`VET-NOTIF-0001` (502 — provider hatası) veya
`VET-NOTIF-0002` (404 — şablon bulunamadı).

### GET /api/v1/notifications/inbox

Aktif kullanıcının in-app bildirim listesi. `userId` query
opsiyonel; default `actor.actorId`. Auth +
`common:notification:read`. Detay: `docs/api/api.get._api_v1_notifications_inbox.md`.

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

## Superadmin — Tenant Görünümü (`/api/v1/superadmin/tenants`)

SUPERADMIN paneli için tenant listeleme, detay ve son audit event
endpoint'leri. Tüm endpoint'ler `audit:log:read` permission'ı
(+ SUPERADMIN bypass) ile korunur; normal kullanıcılar
`VET-AUTHZ-0001` (403) alır. FAZ-1'de okuma amaçlıdır; yazma
(tenant suspend vb.) sonraki goal'lerde.

### GET /api/v1/superadmin/tenants

Tüm tenant'ların özet görünümü (SUPERADMIN).

- **Modül:** audit (superadmin)
- **Yetki:** `audit:log:read` (SUPERADMIN bypass)
- **Query:** `page` (default 1), `pageSize` (default 20, max 100),
  `status?` (`active`|`suspended`|`closed`),
  `country?` (`TR`|`GB`), `search?` (1-100 karakter)
- **Response 200:** `ListSuperadminTenantsResponse`
  (items: `TenantOverview[]`, total, page, pageSize)

**Response 200 (özet):**

```json
{
  "items": [
    {
      "tenantId": "tnt-uuid",
      "name": "Pilot Veteriner Kliniği",
      "country": "TR",
      "status": "active",
      "createdAt": "2026-07-30T12:00:00.000Z",
      "branchCount": 1,
      "userCount": 4,
      "enabledModules": ["clinic", "petshop", "file"],
      "lastLoginAt": "2026-07-30T11:45:12.000Z",
      "errorCountLast24h": 0,
      "storageUsedMb": 12.5
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

Detay: [`api.get._api_v1_superadmin_tenants.md`](./api.get._api_v1_superadmin_tenants.md)

### GET /api/v1/superadmin/tenants/:id

Tek tenant'ın detay görünümü + son 10 audit event.

- **Modül:** audit (superadmin)
- **Yetki:** `audit:log:read` (SUPERADMIN bypass)
- **Path param:** `id` (uuid)
- **Response 200:** `TenantDetailResponse` (`TenantOverview` +
  `recentEvents: AuditEventSummary[]`)
- **Hata kodu:** `VET-TENANT-0001` (404 — tenant bulunamadı)

Detay: [`api.get._api_v1_superadmin_tenants__id.md`](./api.get._api_v1_superadmin_tenants__id.md)

### GET /api/v1/superadmin/tenants/:id/events

Tenant'ın son 10 audit event'i (tarih azalan). Şüpheli
aktivite tespiti için kullanılır.

- **Modül:** audit (superadmin)
- **Yetki:** `audit:log:read` (SUPERADMIN bypass)
- **Path param:** `id` (uuid)
- **Response 200:** `{ items: AuditEventSummary[] }`
- **Hata kodu:** `VET-TENANT-0001` (404)

Detay: [`api.get._api_v1_superadmin_tenants__id_events.md`](./api.get._api_v1_superadmin_tenants__id_events.md)

**Tasarım notları:**

- `errorCountLast24h` FAZ-1'de sabit `0` döner (log
  aggregation altyapısı FAZ-3+'da). UI'da "veri yok" badge'i
  gösterilebilir.
- `storageUsedMb` `FileMeta.sizeBytes` (BigInt) toplamı →
  MB. Arşivlenen dosyalar (`archivedAt != null`) dahil değil.
- `lastLoginAt` tenant'ın tüm kullanıcıları arasında en yeni
  `User.lastLoginAt`; hiç login yoksa `null`.
- In-memory aggregation: DB view katmanı yok, her tenant için
  4 paralel sorgu. Pilot ölçekte yeterli.

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
