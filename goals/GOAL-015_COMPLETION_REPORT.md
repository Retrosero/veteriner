# GOAL-015 Completion Report — Bildirim altyapısı temeli

## Goal

- Goal no: GOAL-015
- Başlık: Bildirim altyapısı temeli
- Faz: FAZ-1 (Platform çekirdeği)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30

## Yapılan işler (özet)

- **Notification tipleri ve sözleşme** (`common/notifications/notification.types.ts` +
  `packages/contracts/src/notification.ts`): `NotificationRequest`,
  `NotificationRecord`, `InboxItem`, `InboxResponse`. Kanal
  (`sms` / `email` / `in_app` / `whatsapp`), kategori
  (`appointment` / `vaccination` / `lab` / `invoice` / `portal` /
  `system` / `marketing`), durum (`queued` / `sent` / `failed` /
  `read`) Zod ile valide.
- **Provider interface** (`provider.interface.ts`) + 4 implementasyon:
  - `SmtpEmailProvider` (gerçek SMTP stub'ı; üretimde Nodemailer/Postmark)
  - `IletimerkeziSmsProvider` (TR SMS sağlayıcı stub'ı; HTTP call mock)
  - `InAppProvider` + `InboxStore` (in-memory kullanıcı inbox)
  - `NoopProvider` (test/fallback)
- **Template engine** (`template.service.ts`): `{{variable}}` substitution,
  in-memory frozen registry, **5 template × 2 locale** = 10 kayıt:
  `appointment_reminder`, `vaccination_due`, `lab_result_ready`,
  `invoice`, `portal_invite`. Her template tr-TR + en-GB destekler;
  eksik değişkenler boş string render edilir; HTML escape uygulanmaz
  (düz metin).
- **Consent service** (`consent.service.ts`): tenant bazlı iletişim
  izinleri (channel×category matris). İzinsiz kanalda gönderim
  `VET-NOTIF-0003` (warning, queued=false) ile reddedilir; marketing
  kategorisi için açık opt-in zorunludur.
- **Idempotency service** (`idempotency.service.ts`): `Idempotency-Key`
  header + `(tenantId, userId, idempotencyKey)` tuple bazlı dedup.
  Aynı anahtar ile tekrar istek → önceki response döner (24 saat
  TTL, in-memory Map).
- **Queue** (`queue.ts`): kanal bazlı in-memory kuyruk + retry
  (exponential backoff, max 3 deneme). Üretimde BullMQ adapter'ı
  aynı interface ile değiştirilir.
- **NotificationsService** (`modules/notifications/notifications.service.ts`):
  `send()` orchestrator'ı consent check → template render → queue →
  provider dispatch → audit → response. `inbox()` tenant scope'lu
  in-app listesi.
- **NotificationsController** (`/api/v1/notifications`):
  - `POST /api/v1/notifications` (auth + `common:notification:manage`)
  - `GET  /api/v1/notifications/inbox` (auth + `common:notification:read`)
- **Hata kodları**: `VET-NOTIF-0001` (502 — provider hatası),
  `VET-NOTIF-0002` (404 — şablon bulunamadı), `VET-NOTIF-0003`
  (warning — consent reddi, 403).
- **16 yeni test** (`notifications.service.spec.ts`): happy path,
  template render tr/en, eksik değişken, idempotency replay,
  consent reddi, retry/backoff, provider hatası → failed durumu,
  in-app inbox, cross-tenant izolasyon.

## Değişen dosyalar (core + docs)

**Core (commit f94f143):**

- `apps/api/src/common/notifications/notification.types.ts` — yeni.
- `apps/api/src/common/notifications/provider.interface.ts` — yeni.
- `apps/api/src/common/notifications/providers/smtp-email.provider.ts` — yeni (stub).
- `apps/api/src/common/notifications/providers/iletimerkezi-sms.provider.ts` — yeni (stub).
- `apps/api/src/common/notifications/providers/in-app.provider.ts` — yeni + InboxStore.
- `apps/api/src/common/notifications/providers/noop-provider.ts` — yeni.
- `apps/api/src/common/notifications/template.service.ts` — yeni.
- `apps/api/src/common/notifications/consent.service.ts` — yeni.
- `apps/api/src/common/notifications/idempotency.service.ts` — yeni.
- `apps/api/src/common/notifications/queue.ts` — yeni.
- `apps/api/src/modules/notifications/notifications.service.ts` — yeni.
- `apps/api/src/modules/notifications/notifications.controller.ts` — yeni.
- `apps/api/src/modules/notifications/notifications.module.ts` — yeni.
- `apps/api/src/modules/notifications/notifications.service.spec.ts` — yeni (16 test).
- `apps/api/src/modules/notifications/index.ts` — yeni.
- `apps/api/src/app.module.ts` — `NotificationsModule` import.
- `packages/contracts/src/notification.ts` + `index.ts` — paylaşılan Zod şemaları.

**Doküman & i18n (bu commit):**

- `goals/GOAL-015_COMPLETION_REPORT.md` — yeni (bu dosya).
- `PROJECT_CONTEXT.md` — GOAL-015 ✅ işaretlendi.
- `docs/errors/ERROR_CATALOG.md` — `VET-NOTIF-0001..0003` bölümü (core commit).
- `packages/i18n/src/locales/tr-TR.json` + `en-GB.json` — `error.VET-NOTIF-0001/0002` çevirileri.
- `docs/ai/AI_CHUNKS.yaml` — `notification-channel-overview` + `notification-consent-policy` chunk'ları.
- `docs/api/API_CATALOG.md` — Bildirim bölümü.
- `docs/api/api.post._api_v1_notifications.md` — yeni (POST send).

## Notlar ve tasarım kararları

- **In-memory state:** FAZ-1'de template registry, inbox, queue ve
  idempotency cache in-memory (Map). Restart sırasında kayıp tolere
  edilir. DB persistence Faz 11+'da `NotificationRecord` ve
  `NotificationTemplate` tabloları ile gelecek; service imzaları
  korunur.
- **Provider seçimi:** `channel` alanı dispatch sırasında provider
  ile eşleşir (`sms`→Iletimerkezi, `email`→SMTP, `in_app`→InApp).
  `whatsapp` şu an `NoopProvider`'a düşer; Faz 17+ gerçek adapter.
- **Idempotency:** Aynı `(tenantId, userId, idempotencyKey)` 24 saat
  içinde tekrar gelirse ilk response döner; provider yeniden
  çağrılmaz. Operatör retry'ları için kritik.
- **Retry:** Exponential backoff (1s, 4s, 16s). 3. deneme sonrası
  status `failed` olur, `audit:notification.failed` (warning) loglanır.
- **Consent:** Varsayılan izin matrisi tenant oluşturulurken
  `transactional` (appointment/vaccination/lab/invoice/portal) için
  otomatik opt-in; `marketing` için açık opt-in gerekir. Consent
  yoksa `VET-NOTIF-0003` (403) döner ve audit `denied` kaydı atar.
- **Audit:** `audit:notification.sent` (info),
  `audit:notification.failed` (warning),
  `audit:notification.denied` (warning — consent). Metadata'da
  `channel`, `category`, `templateKey`, `attempts`; telefon/e-posta
  PII mask'li.
- **Locale-aware templates:** Her template `tr-TR` + `en-GB` iki
  dilde; actor.locale fallback olarak `tenant.defaultLocale`
  kullanır. Tek locale eksikse hata fırlatılmaz — diğer dilde
  render edilir ve warning loglanır.
- **Idempotency key zorunluluğu:** Şu an opsiyonel; production
  kapısında `Idempotency-Key` header zorunlu olacak (job'lar için).
- **WhatsApp:** Interface tanımlı, provider stub olarak `NoopProvider`
  kullanıyor. Gerçek adapter GOAL-132'de gelecek.

## Veritabanı değişiklikleri

Yok (in-memory). Faz 11+ planı:

- `NotificationRecord` (`tenant_id`, `user_id`, `channel`, `category`,
  `template_key`, `status`, `attempts`, `payload_jsonb`, `sent_at`,
  audit meta)
- `NotificationTemplate` (`tenant_id`, `key`, `locale`, `subject`,
  `body`, `version`, audit meta)
- `NotificationConsent` (`user_id`, `channel`, `category`, `opted_in_at`)

## API değişiklikleri

- `POST /api/v1/notifications` — Manuel bildirim gönder. Auth +
  `common:notification:manage`. Body: `userId`, `channel`, `category`,
  `templateKey`, `locale`, `data`, `idempotencyKey?`. 200 → `NotificationRecord`.
- `GET  /api/v1/notifications/inbox` — Kullanıcının in-app listesi.
  Auth + `common:notification:read`. Query: `userId?` (default: actor).
  200 → `InboxResponse`.

## Test sonucu

- Unit: 16 yeni test eklendi. tsc + vitest temiz.
- Tenant isolation: 2 negatif test (cross-tenant send + inbox).
- Negative path: consent reddi (1), provider hatası (1), retry
  exhaustion (1), template bulunamadı (1), idempotency replay (1).
  Negative-only test oranı ≈ %30.
- Başarısız test: 0.

## Log ve audit

- `audit:notification.sent` (info) — `metadata: { notificationId,
  channel, category, templateKey, attempts }`.
- `audit:notification.failed` (warning) — `metadata: { notificationId,
  channel, attempts, lastError }`.
- `audit:notification.denied` (warning) — `metadata: { userId,
  channel, category, reason: 'consent' }`.

PII (telefon, e-posta) mask'lenerek loglanır. Provider response
tokenları loglanmaz.
