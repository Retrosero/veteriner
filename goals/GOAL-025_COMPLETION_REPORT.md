# GOAL-025 Completion Report — Portal erişim daveti

- Goal no: GOAL-025
- Başlık: Portal erişim daveti
- Faz: FAZ-2 (Klinik domain)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: eaf23b9

## Yapılan işler

**PortalService** (`apps/api/src/modules/portal/portal.service.ts`):
4 public metot — `invite`, `acceptInvitation`, `revoke`,
`listForOwner`. In-memory `byId` Map (portal.repo) + `portalUsers`
Map + `sessionTokens` Map. (1) `invite`: owner aynı tenant'ta
değilse 404 `VET-AUTHZ-0002`; `patientIds` her biri aynı
tenant'ta mı (cross-tenant → 404 `VET-AUTHZ-0002`); email
`trim().toLowerCase()`; token `randomUUID()`; `expiresInDays` 1-30
sınırı dışında → 422 `VET-VALIDATION-0003`; audit
`audit:portal.invite.create` (info). (2) `acceptInvitation`: token
yoksa 404 `VET-PORTAL-0001`; status accepted ise 409
`VET-PORTAL-0002`; pending+expired ise expired olarak işaretle +
410 `VET-PORTAL-0001`; revoked ise 410 `VET-PORTAL-0001`; kabul
atomik (`status=accepted`, `acceptedAt=now`), `PortalUser`
oluşturulur, session token üretilir; audit
`audit:portal.invite.accept` (info). (3) `revoke`: pending
durumda `revoked` yapılır (warning audit); diğer durumlar
idempotent no-op. (4) `listForOwner`: tenant-scoped, ownerId
filtreli.

**PortalController** — 4 yeni endpoint
(`apps/api/src/modules/portal/portal.controller.ts`):
- `POST   /api/v1/portal/invitations` — `user:user:invite`, 201.
- `GET    /api/v1/portal/invitations?ownerId=...` —
  `clinic:owner:read`, 200.
- `DELETE /api/v1/portal/invitations/:id` — `user:user:invite`,
  200 (idempotent).
- `POST   /api/v1/portal/invitations/accept` — **public** (token
  tabanlı), 200; kabul sonrası `portalUserId` + `sessionToken`
  döner. Swagger `operationId: portalInviteCreate |
  portalInviteList | portalInviteRevoke | portalInviteAccept`.
  `ZodValidationPipe` ile input doğrulama.

**Sözleşme** (`packages/contracts/src/portal.ts`):
`portalInvitationStatusSchema` (Zod) — `pending | accepted |
expired | revoked`. `portalInviteInputSchema` (ownerId UUID,
email max 200, patientIds 1-50, expiresInDays 1-30, locale
tr-TR/en-GB). `portalAcceptInputSchema` (token UUID + opsiyonel
passwordHash). `portalListQuerySchema` (ownerId UUID).
`portalInvitationSchema` (id, tenantId, ownerId, email, status,
invitedAt/expiresAt/acceptedAt/revokedAt ISO, invitationToken
UUID, patientIds, locale, invitedBy).
`portalAcceptResponseSchema` (portalUserId + sessionToken UUID).

**12 yeni test** (`portal.service.spec.ts`): (1) invite happy
path (audit + token UUID), (2) invite cross-tenant owner → 404,
(3) invite cross-tenant patient → 404, (4) invite
`expiresInDays` üst sınır → 422, (5) accept happy path
(PortalUser + sessionToken), (6) accept invalid token → 404
VET-PORTAL-0001, (7) accept already accepted → 409
VET-PORTAL-0002, (8) accept expired → 410 VET-PORTAL-0001
(otomatik expired işaretleme), (9) accept revoked → 410
VET-PORTAL-0001, (10) revoke pending → status revoked + audit
warning, (11) revoke idempotent (accepted/no-op), (12)
listForOwner tenant-scoped filtre.

## Tasarım kararları

- **Token tek seferlik:** `acceptInvitation` sonrası status
  `accepted` olarak işaretlenir; tekrar kullanılamaz. Frontend
  token'ı URL'de (`/portal/accept?token=...`) taşır, kabul
  sonrası session cookie'ye bağlanır.
- **Public accept endpoint:** Tenant + yetki guard YOK; sadece
  geçerli token yeterli. Tenant ID token içinde implicit
  (davet oluşturulurken set edilmiş). Bu nedenle
  cross-tenant IDOR mümkün değil: davet zaten tenant-scoped.
- **Audit yoğunluğu:** invite (info), accept (info), revoke
  (warning) — kabul reddedilse (410/409) audit
  yayınlanmaz; yalnızca "kabul edildi" eventi kalıcı.
- **Idempotent revoke:** Pending dışı durumlar no-op; UI için
  "iptal edildi" mesajı verir ama audit tekrarı yok.
- **expiresInDays sınırı 1-30:** Çok uzun süre açık token
  güvenlik riski; çok kısa süre UX sorunu. 7 gün default
  (öneri, controller'da default; bu commit'te zorunlu).
- **Session token in-memory:** Production'da ayrı
  `PortalSession` tablosu; controller httpOnly cookie
  set'ini hazırlar, service token üretir.
- **PII:** email response'da görünür (kendi daveti),
  AuditService mask'ler. TCKN/telefon dahil değil.

## Değişen dosyalar

**Core (eaf23b9):** `apps/api/src/modules/portal/` (modül +
controller + service + repository + spec),
`apps/api/src/common/portal/portal.types.ts`,
`packages/contracts/src/portal.ts` (yeni),
`packages/contracts/src/index.ts`.

**Docs & i18n (bu commit):** bu rapor + `PROJECT_CONTEXT.md`
⏳ → ✅ + 4 API doc + `AI_CHUNKS.yaml` (+2 chunk:
`flow-portal-invite`, `error-VET-PORTAL-0001`) + yeni
`docs/user-education/PATIENT_OWNER.md`. Hata kataloğu ve i18n
zaten VET-PORTAL-0001/0002 parity ile mevcut (core commit'te).

## Veritabanı

Yok. In-memory `byId` Map (davetler) + `portalUsers` Map +
`sessionTokens` Map. Production'a geçişte
`PortalInvitation`, `PortalUser`, `PortalSession` tabloları +
`tenantId/ownerId/status/expiresAt` index'leri.

## API

| Method | Path                                       | Yetki                 | Kod |
| ------ | ------------------------------------------ | --------------------- | --- |
| POST   | /api/v1/portal/invitations                 | user:user:invite      | 201 |
| GET    | /api/v1/portal/invitations?ownerId=...     | clinic:owner:read     | 200 |
| DELETE | /api/v1/portal/invitations/:id             | user:user:invite      | 200 |
| POST   | /api/v1/portal/invitations/accept          | public                | 200 |

Hatalar: 404 `VET-AUTHZ-0002` (cross-tenant owner/patient), 404
`VET-PORTAL-0001` (token bulunamadı), 409 `VET-PORTAL-0002`
(already accepted), 410 `VET-PORTAL-0001` (expired/revoked),
422 `VET-VALIDATION-0003` (expiresInDays), 400
`VET-TENANT-0001`, 401 `VET-AUTH-0001`, 403 `VET-AUTHZ-0001`.

## Test

12 yeni unit test. Tenant izolasyonu, owner/patient
cross-tenant 404, expiresInDays sınırı, token üretimi (UUID),
kabul akışının 4 durumu (success/already/expired/revoked),
revoke idempotency, audit event yayını (invite/accept/revoke).
Başarısız: 0.

## Bilinen riskler

- In-memory storage (pilot); DB persistence FAZ-3+'da
  (PortalUser, PortalSession tabloları).
- Accept endpoint public; rate-limiting FAZ-3+'da
  (GOAL-105 güvenlik logları).
- Session token cookie binding FAZ-3+; şimdilik response
  body'de.
- E-posta gönderimi (davet linki) FAZ-3+ (GOAL-015
  notification altyapısı + GOAL-131 SMS/132 WhatsApp).
- UI tarafı (kabul ekranı, login) GOAL-033 (FAZ-3).

## Sıradaki

FAZ-3 — Randevu + portal. GOAL-030 (klinik takvimi), GOAL-033
(portal kayıt + giriş), GOAL-034 (portal hayvan listesi).
