# GOAL-036 Completion Report — Randevu hatırlatma sistemi

- Goal no: GOAL-036
- Başlık: Randevu hatırlatma sistemi
- Faz: FAZ-3 (Randevu + portal)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: f43353c

## Yapılan işler (core, f43353c)

**AppointmentRemindersService**
(`apps/api/src/modules/appointment-reminders/appointment-reminders.service.ts`)
— 5 public metot. (1) `scheduleForAppointment(tenantId, appointment,
actor)`: randevu başlangıcından **24 saat önce** default config ile
hatırlatma planlar; `scheduledFor` geçmişte ise skip; aynı
`(appointmentId, channel, scheduledFor)` idempotent
(`AppointmentRemindersRepository.buildDedupeKey`); marketing consent
yoksa sms atlanır, `in_app`'e düşülür; tenant locale (`tr-TR`/`en-GB`)
çözümlenir; `NotificationsService.send` hook'unda kullanılmak üzere
appointment snapshot repository'ye kopyalanır; audit
`audit:appointment_reminder.schedule` (info). (2)
`cancelForAppointment`: tüm `status='scheduled'` kayıtlar `cancelled`
olur; zaten `sent/failed/cancelled` olanlara dokunmaz; audit
`audit:appointment_reminder.cancel` (info). (3)
`rescheduleForAppointment`: delta hesabıyla `scheduledFor` kaydırılır;
yeni zaman geçmişe düşenler `cancelled` yapılır; audit
`audit:appointment_reminder.reschedule` (info). (4)
`processDueReminders(now)`: `now >= scheduledFor && status='scheduled'`
olanları dispatch eder (batch üst sınır 100); snapshot üzerinden
`patient/owner/locale` çözümü; `ConsentService.canSend(...)` kontrolü
(opt-out → `cancelled`, `opted_out` lastError); notification durumuna
göre `sent/failed/cancelled`; SYSTEM audit
`audit:appointment_reminder.process_due` (failed>0 ise warning).
(5) `listForAppointment(tenantId, appointmentId, query, actor)`:
tenant-scoped `status/limit/offset` filtreli liste.

**AppointmentRemindersController** (`.controller.ts`) — 2 endpoint:

- `GET  /api/v1/clinic/appointments/:id/reminders`
  (`@RequirePermissions("clinic:appointment:read")`, 200) — query
  Zod `reminderListQuerySchema` (`status?`, `limit? 1-200 default 50`,
  `offset? default 0`).
- `POST /api/v1/clinic/appointment-reminders/process` (200) — admin/
  job çağrısı; tenant-bağlamı zorunlu değil (`{processed, sent,
failed, skipped}` döner). FAZ-3'te manuel trigger; BullMQ worker
  Faz 11+'da bu endpoint'i çağıracak.

> Not: scheduleForAppointment / cancelForAppointment /
> rescheduleForAppointment **hook**'larıdır; doğrudan REST endpoint'i
> yoktur. `AppointmentsService.{create,cancel,update}` içinden
> çağrılır. Bu nedenle core'da yalnızca 2 endpoint vardır (yukarıdaki).

**Repository** (`.repository.ts`, 266 satır) — in-memory `byId`,
`byAppointment`, `byDue` Map'leri; `dedupeKey` üzerinden
`insert` (idempotent — `existing` döner); `buildDedupeKey`,
`cancelForAppointment`, `rescheduleForAppointment` (deltaMs ile
geçmişe düşenleri `cancelled` yap), `listForAppointment` (status
filtresi + limit/offset), `listDue(now, batch)`, `update` partial
patch.

**Module** (`.module.ts`) — `AppointmentRemindersService`,
`AppointmentRemindersRepository`, controller; `AppointmentsModule`
`forwardRef` ile bağlanır (circular dependency kaçınılır). `Reminders`
sub-agent davranışı: randevu değişikliği → reminder'lar otomatik
senkronize.

**Sözleşme** (`packages/contracts/src/appointment-reminder.ts`) —
Zod şemalar: `reminderChannelSchema` (sms | email | in_app),
`reminderStatusSchema` (scheduled | sent | failed | cancelled),
`reminderConfigInputSchema` (hoursBeforeAppointment 1-168,
channels[]), `reminderListQuerySchema` (status?, limit 1-200
default 50, offset default 0).

**23 yeni test** (`appointment-reminders.service.spec.ts`, 731 satır):
schedule 6 (happy + idempotent + past skip + invalid start +
patient/owner missing + consent sms skip), cancel 3 (all scheduled +
no-op sent + audit metadata), reschedule 4 (delta kaydırma + geçmişe
düşen cancel + no-op eşit zaman + missing actor), processDue 8
(sent/failed/cancelled/opted_out/queued/missing_snapshot/
appointment_status_* + SYSTEM audit), list 2 (filtre + tenant scope).

## Tasarım kararları

- **Hook mimarisi:** Schedule/cancel/reschedule REST değil; randevu
  lifecycle'ına bağlı. Bu sayede istemci "hatırlatma kur" demek
  zorunda kalmaz; randevu oluşturulduğunda otomatik planlanır.
- **24h default + sms/in_app:** Klinik başına override altyapısı
  (`reminderConfigInputSchema`) mevcut; FAZ-3+'da tenant settings UI
  ile bağlanacak.
- **Idempotency 2 katmanlı:** (a) `dedupeKey` (appointmentId + channel
  - scheduledFor) → repository insert çakışmasında `existing` döner;
    (b) `NotificationsService.send(idempotencyKey=appt-reminder|{id})`
    → notification tarafında çift dispatch önlenir.
- **Snapshot alanı:** processDueReminders anında `Appointment`'a
  bağımlı kalmamak için schedule sırasında repository'ye kopyalanır.
  Cross-tenant bilgi sızdırmaz (rec.tenantId altında izole).
- **Consent öncelikli:** `ConsentService.canSend(userId, channel,
"appointment_reminder")` — opt-out → `cancelled` (yeniden
  denenmez, `opted_out` audit metadata).
- **Appointment status korelasyonu:** `cancelled/completed/no_show`
  randevuya hatırlatma gitmez; snapshot üzerinden kontrol edilip
  reminder `cancelled` yapılır.
- **System actor:** processDueReminders SYSTEM audit üretir
  (`actorId: "system"`, `actorType: "system"`); correlation
  `system-job`.
- **In-memory `byId` Map:** FAZ-0 pilot; DB persistence FAZ-11+ ile.
  Üretimde: `appointment_reminders` (id, tenantId, appointmentId,
  channel enum, scheduledFor timestamptz, status enum, attempts int,
  lastError text, sentAt?, createdAt, dedupeKey unique, snapshot
  jsonb). Indexler: `(tenantId, status, scheduledFor)` (due list),
  `(tenantId, appointmentId, status)` (randevuya göre liste),
  `dedupeKey` unique.

## Değişen dosyalar

**Core (f43353c):**
`apps/api/src/modules/appointment-reminders/{appointment-reminders.{module,
controller,service,service.spec,repository,index}}.ts`,
`packages/contracts/src/appointment-reminder.ts`,
`packages/contracts/src/index.ts`, migration yok.

**Docs & i18n (bu commit):**
`goals/GOAL-036_COMPLETION_REPORT.md` (bu dosya),
`PROJECT_CONTEXT.md` (GOAL-036 ⏳→✅, FAZ-3 ⏳→✅, FAZ-4 eklendi),
2 API doc
(`docs/api/api.get._api_v1_clinic_appointments__id_reminders.md`,
`docs/api/api.post._api_v1_clinic_appointment-reminders_process.md`),
`docs/ai/AI_CHUNKS.yaml` (+1 chunk: `reminder-overview`). Yeni hata
kodu yok (`VET-AUTHZ-0001`, `VET-TENANT-0001`, `VET-AUTH-0001`,
`VET-VALIDATION-0001` zaten katalogda). Yeni i18n anahtarı yok
(`appointment_reminder` template'i notification modülü tarafında
handled).

## Veritabanı

Yok (FAZ-3 pilot). In-memory `byId: Map<string, AppointmentReminderRecord>`

- `byAppointment`, `byDue` indexleri. Üretimde:
  `appointment_reminders` (id, tenantId, appointmentId, channel enum,
  scheduledFor timestamptz, status enum, attempts int, lastError text,
  sentAt timestamptz?, createdAt timestamptz, dedupeKey text unique,
  snapshot jsonb). Indexler: `(tenantId, status, scheduledFor)`,
  `(tenantId, appointmentId, status)`, `dedupeKey` unique.

## API

| Method | Path                                         | Auth               | Kod |
| ------ | -------------------------------------------- | ------------------ | --- |
| GET    | /api/v1/clinic/appointments/:id/reminders    | staff + perm       | 200 |
| POST   | /api/v1/clinic/appointment-reminders/process | staff + perm (job) | 200 |

Hatalar: 401 `VET-AUTH-0001` (Guard), 403 `VET-AUTHZ-0001`
(cross-tenant), 400 `VET-TENANT-0001` (tenant bağlamı yok, list
için), 400 `VET-VALIDATION-0001` (Zod parse).

> Hook endpointleri (`scheduleForAppointment`,
> `cancelForAppointment`, `rescheduleForAppointment`) doğrudan REST
> değil; `AppointmentsService.{create,cancel,update}` üzerinden
> dolaylı olarak tetiklenir.

## Test

23 yeni unit test. Schedule 6; cancel 3; reschedule 4; processDue 8;
list 2. **Tüm testler geçti** (commit mesajına göre 427/427 api
testi + 23/23 reminder testi, toplam 450/450). Başarısız: 0.

## Bilinen riskler

- In-memory `byId` Map pilot; restart → state kaybolur. DB
  migration FAZ-11+ ile birlikte.
- BullMQ worker hook'u Faz 11+'da; bu aşamada processDueReminders
  yalnızca manuel `POST /process` veya testten tetiklenir.
- `appointment_reminder` notification template'i düz metin fallback
  ile; zengin template'ler + per-locale varyasyonlar notification
  modülü sonrası.
- Snapshot alanı jsonb'ye taşınırken PII kontrolü yapılmalı
  (patient name + owner PII içermez; appointment metadata yeterli).
- Tenant config override (hoursBeforeAppointment, channels) henüz
  UI'dan ayarlanamıyor; sadece contract/schema seviyesinde.

## Sıradaki

**FAZ-3 tamamen tamamlandı** 🎉. Sırada **FAZ-4 — Klinik
muayene/aşı/reçete** (GOAL-040 muayene başlatma → GOAL-047 klinik
PDF). Öncelikli: appointment → examination tetikleyicisi,
e2e:smoke regression, BullMQ reminder worker planlaması.
