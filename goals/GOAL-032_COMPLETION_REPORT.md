# GOAL-032 Completion Report — Bekleme listesi ve resepsiyon akışı

- Goal no: GOAL-032
- Başlık: Bekleme listesi ve resepsiyon akışı
- Faz: FAZ-3 (Randevu + portal)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 6836ce3

## Yapılan işler (core, 6836ce3)

**WaitlistService** (`apps/api/src/modules/waitlist/waitlist.service.ts`)
— 7 public metot. (1) `add(tenantId, input, actor)`: patient
cross-tenant guard (→ 404 `VET-CLINIC-0001`); `expiresAt` verilmezse
`now + 30 gün` (`WAITLIST_DEFAULT_TTL_DAYS`); `status=waiting`; audit
`audit:waitlist.add` (info). (2) `findById(tenantId, id, actor)`:
tenant-scoped null döner. (3) `list(tenantId, filters, actor)`:
`status/priority/patientId/from/to` filtre; sıralama
**emergency > urgent > normal**, sonra `createdAt asc`. (4)
`notify(tenantId, id, actor)`: `status=notified`, `notifiedAt=now`;
`scheduled`/`cancelled` → 422 `VET-CLINIC-0006`; notification stub
(`in_app`, `templateKey=waitlist.notify`) hata durumunda akışı
durdurmaz (best-effort); audit `audit:waitlist.notify` (info). (5)
`convertToAppointment(tenantId, id, appointmentId, actor)`:
`status=scheduled`, `scheduledAppointmentId` set; aynı `id` ile
tekrarlanan idempotent; `cancelled/expired` → 422
`VET-CLINIC-0006`; audit `audit:waitlist.schedule` (info). (6)
`cancel(tenantId, id, reason, actor)`: `status=cancelled`; idempotent;
`scheduled/expired` → 422; audit `audit:waitlist.cancel`
(**warning**) + reason. (7) `expireOverdue()`: periyodik; `waiting
&& expiresAt<now` → `expired`; audit `audit:waitlist.expire` (system,
info); dönen değer expire edilen kayıt sayısı.

**WaitlistController** — 5 endpoint
(`apps/api/src/modules/waitlist/waitlist.controller.ts`):
- `POST /api/v1/clinic/waitlist` —
  `clinic:appointment:create`, 201.
- `GET  /api/v1/clinic/waitlist` —
  `clinic:appointment:read`, 200.
- `POST /api/v1/clinic/waitlist/:id/notify` —
  `clinic:appointment:update`, 200.
- `POST /api/v1/clinic/waitlist/:id/schedule` —
  `clinic:appointment:create`, 200.
- `POST /api/v1/clinic/waitlist/:id/cancel` —
  `clinic:appointment:cancel`, 200.
Swagger `operationId: waitlistAdd | waitlistList | waitlistNotify |
waitlistSchedule | waitlistCancel`. `ZodValidationPipe` ile input
doğrulama; `requireTenant()` tenant bağlamı zorunlu
(`VET-TENANT-0001`).

**Sözleşme** (`packages/contracts/src/waitlist.ts`) — Zod şemaları:
`waitlistStatusSchema` (waiting|notified|scheduled|cancelled|expired),
`waitlistPrioritySchema` (normal|urgent|emergency), `waitlistEntrySchema`,
`waitlistEntryCreateSchema`, `waitlistFiltersSchema`,
`waitlistListResponseSchema`.

**14 yeni test** (`waitlist.service.spec.ts`): (1) add default 30
gün expires + audit, (2) add custom expiresAt, (3) cross-tenant
patient → 404, (4) list priority sıralaması, (5) list status filtresi,
(6) list priority filtresi, (7) notify + notification stub + audit,
(8) notify cancelled → 422, (9) convertToAppointment + audit, (10)
convertToAppointment cancelled → 422, (11) cancel + audit warning +
reason, (12) cancel idempotent, (13) expire overdue + audit.system,
(14) süresi dolmamış kayıt expire olmaz.

## Tasarım kararları

- **Öncelik sıralaması:** `emergency (0) > urgent (1) > normal (2)`;
  aynı öncelik içinde `createdAt asc`. Resepsiyon ekranında acil
  vakalar her zaman üstte.
- **State machine:** `waiting → notified → scheduled` (mutlu yol);
  `* → cancelled` (iptal), `waiting → expired` (TTL). `scheduled` ve
  `expired` terminal; `cancelled` idempotent terminal.
- **30 gün default TTL:** `WAITLIST_DEFAULT_TTL_DAYS=30`; override
  `add` body'ye `expiresAt` ile mümkün. Periyodik `expireOverdue`
  çağrısı FAZ-0'da manuel, FAZ-3+'da cron job.
- **NotificationService stub:** `waitlist.notify` için
  `in_app/custom/templateKey=waitlist.notify` best-effort. Hata
  durumunda audit.info yeterli iz; gerçek provider (SMS/email)
  FAZ-10+'da retry/backoff ile eklenecek.
- **Tenant guard:** Service içinde `requireTenantScope` —
  SUPERADMIN bypass, diğer actor'ler için `actor.tenantId===tenantId`.
- **In-memory storage:** Map üzerinde `waitlistByTenant`; production'a
  geçişte Prisma `WaitlistEntry` tablosu + `tenantId/patientId/
  status` index.
- **VET-CLINIC-0006 paylaşımı:** Kod hem ownership-history (409 aktif
  sahiplik çakışması) hem waitlist (422 state geçişi) tarafından
  kullanılır. Katalog güncellendi (ERROR_CATALOG.md).

## Değişen dosyalar

**Core (6836ce3):** `apps/api/src/modules/waitlist/{waitlist.module,
waitlist.controller,waitlist.service,waitlist.repository,waitlist.types,
waitlist.service.spec,index}.ts`, `apps/api/src/app.module.ts`,
`packages/contracts/src/{waitlist,index}.ts`.

**Docs & i18n (bu commit):** `goals/GOAL-032_COMPLETION_REPORT.md`
(bu dosya), `PROJECT_CONTEXT.md` (⏳ → ✅),
`docs/errors/ERROR_CATALOG.md` (`VET-CLINIC-0006` çift kullanım
notu), 5 API doc
(`docs/api/api.{post,get}._api_v1_clinic_waitlist*.md`),
`docs/ai/AI_CHUNKS.yaml` (+1 chunk: `flow-waitlist`),
`packages/i18n/src/locales/{tr-TR,en-GB}.json` (`VET-CLINIC-0006`
genel mesaj).

## Veritabanı

Yok. In-memory `waitlistByTenant` Map. Production'a geçişte
`WaitlistEntry` tablosu + `tenantId/patientId/status` index +
`ownerId` FK + `scheduledAppointmentId` FK.

## API

| Method | Path | Yetki | Kod |
| ------ | ---- | ----- | --- |
| POST   | /api/v1/clinic/waitlist              | clinic:appointment:create | 201 |
| GET    | /api/v1/clinic/waitlist              | clinic:appointment:read   | 200 |
| POST   | /api/v1/clinic/waitlist/:id/notify   | clinic:appointment:update | 200 |
| POST   | /api/v1/clinic/waitlist/:id/schedule | clinic:appointment:create | 200 |
| POST   | /api/v1/clinic/waitlist/:id/cancel   | clinic:appointment:cancel | 200 |

Hatalar: 404 `VET-CLINIC-0001` (patient/waitlist kaydı yok /
cross-tenant), 422 `VET-CLINIC-0006` (state geçişi), 422
`VET-VALIDATION-0001` (parse), 400 `VET-TENANT-0001`, 403
`VET-AUTHZ-0001`, 401 `VET-AUTH-0001`.

## Test

14 yeni unit test. Add 3 (happy + custom TTL + cross-tenant); list
3 (priority + status + priority filter); notify 2 (success + cancelled
422); convertToAppointment 2 (success + cancelled 422); cancel 2
(success + idempotent); expireOverdue 2 (overdue + not overdue).
Başarısız: 0.

## Bilinen riskler

- In-memory storage (pilot); DB persistence FAZ-3+'da.
- `expireOverdue` FAZ-0'da manuel; cron FAZ-3+'da eklenecek.
- Notification stub FAZ-0'da no-op; gerçek kanal FAZ-10+'da.
- VET-CLINIC-0006 kod paylaşımı (ownership 409 / waitlist 422);
  katalog güncellendi. İleride domain-specific kodlara ayrılabilir.

## Sıradaki

FAZ-3 — Randevu + portal. GOAL-033 (portal kayıt), GOAL-034 (portal
hayvan), GOAL-035 (online randevu talebi), GOAL-036 (hatırlatma).
