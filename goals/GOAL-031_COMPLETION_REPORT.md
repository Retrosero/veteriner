# GOAL-031 Completion Report — Randevu oluşturma ve yönetim

- Goal no: GOAL-031
- Başlık: Randevu oluşturma ve yönetim
- Faz: FAZ-3 (Randevu + portal)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 5b033da

## Yapılan işler (core, 5b033da)

**AppointmentsService** (`apps/api/src/modules/appointments/appointments.service.ts`)
— 7 public metot. (1) `create(tenantId, input, actor)`:
patient cross-tenant guard (→ 404 `VET-CLINIC-0001`);
`start` gelecekte olmalı + `durationMin` 1-240 (→ 422
`VET-VALIDATION-0009`); `CalendarService.checkAvailability` ile
booked/blocked çakışma (→ 409 `VET-APPT-0005`); `end = start +
durationMin*60_000`; repo'ya ekle + calendar'a booked slot yaz;
audit `audit:appointment.create` (info). (2) `findById`: tenant-scoped
null döner. (3) `list`: `patientId/veterinarianId/status/from/to`
filtre + `limit/offset` pagination. (4) `update`: start/duration/vet
değiştiyse eski booked slot release, yeni zaman için uygunluk kontrol
+ başarısızsa eski slot compensation ile geri konur; audit
`audit:appointment.update` (info) `before/after` snapshot. (5)
`cancel`: idempotent; `completed` → 422 `VET-APPT-0006`; calendar'dan
booked slot kaldırılır; audit `audit:appointment.cancel` (**warning**)
+ reason. (6) `complete`: idempotent; `cancelled` → 422
`VET-APPT-0006`; audit `audit:appointment.complete` (info). (7)
`markNoShow`: idempotent; `cancelled/completed` → 422; audit
`audit:appointment.no_show` (**warning**).

**AppointmentsController** — 7 endpoint
(`apps/api/src/modules/appointments/appointments.controller.ts`):
- `POST   /api/v1/clinic/appointments` —
  `clinic:appointment:create`, 201.
- `GET    /api/v1/clinic/appointments/:id` —
  `clinic:appointment:read`, 200.
- `GET    /api/v1/clinic/appointments` —
  `clinic:appointment:read`, 200.
- `PATCH  /api/v1/clinic/appointments/:id` —
  `clinic:appointment:update`, 200.
- `POST   /api/v1/clinic/appointments/:id/cancel` —
  `clinic:appointment:cancel`, 200.
- `POST   /api/v1/clinic/appointments/:id/complete` —
  `clinic:appointment:complete`, 200.
- `POST   /api/v1/clinic/appointments/:id/no-show` —
  `clinic:appointment:complete`, 200.
Swagger `operationId: appointmentCreate | appointmentGetById |
appointmentList | appointmentUpdate | appointmentCancel |
appointmentComplete | appointmentNoShow`. `ZodValidationPipe` ile
input doğrulama; `requireTenant()` tenant bağlamı zorunlu
(`VET-TENANT-0001`).

**Sözleşme** (`packages/contracts/src/appointments.ts`) — Zod şemaları:
`appointmentStatusSchema` (scheduled|confirmed|arrived|in_progress|
completed|cancelled|no_show), `appointmentTypeSchema` (consultation|
vaccination|surgery|follow_up|lab_visit|grooming), `appointmentSchema`,
`appointmentCreateInputSchema`, `appointmentUpdateInputSchema`,
`appointmentCancelInputSchema`, `appointmentFiltersSchema`,
`appointmentListResponseSchema`.

**16 yeni test** (`appointments.service.spec.ts`): (1) create başarı
(bookSlot + audit), (2) cross-tenant patient → 404, (3) geçmiş start
→ 422, (4) slot booked çakışması → 409, (5) slot blocked çakışması
→ 409, (6) duration=0 → 422, (7) findById kendi tenant, (8) findById
cross-tenant null, (9) list patientId filtresi, (10) list vet filter
yanlış → 0, (11) update start çakışma + compensation, (12) update
notes + audit, (13) cancel + releaseSlot + audit, (14) cancel
idempotent, (15) complete + audit, (16) markNoShow + audit.

## Tasarım kararları

- **CalendarService bağımlılığı:** Appointment oluşturma ve iptal
  CalendarService'in `checkAvailability` / `bookSlot` / `releaseSlot`
  metotlarına bağlanır. Randevu zaman aralığı çakışması tek noktada
  kontrol edilir; calendar+appointment tutarlılığı korunur.
- **Update compensation:** start değişikliğinde önce eski slot
  release edilir; yeni slot uygun değilse eski slot aynı anahtarla
  geri konur. Çift adımlı işlem; in-memory senkron olduğu için
  race-condition riski düşüktür.
- **State machine:** `cancelled` ve `completed` terminal durumlardır.
  Bu durumlardan güncelleme / iptal / tamamlama / no-show YASAK
  (`VET-APPT-0006`). `cancel` ve `complete` / `noShow` kendi
  durumlarında idempotent.
- **Audit seviyesi:** cancel + no_show **warning** (anomali), create
  + update + complete **info**. reason alanı cancel audit payload'unda
  plain text tutulur; KVKK kapsamında erişim yetkisi sınırlıdır.
- **In-memory storage:** Map üzerinde `appointmentsByTenant` +
  tenantId index; production'a geçişte Prisma `Appointment` tablosu
  ile değiştirilecek (API sözleşmesi sabit kalır).
- **Patient cross-tenant:** randevu oluşturma patient üzerinden tenant
  guard uygular. Veterinarian için ayrı entity modülü olmadığından
  `actor.tenantId` + `non-empty` minimum kural yeterlidir; FAZ-3+
  Veteriner modülü ile sıkılaştırılacak.

## Değişen dosyalar

**Core (5b033da):**
`apps/api/src/modules/appointments/{appointments.module,
appointments.controller,appointments.service,appointments.repository,
appointments.types,appointments.service.spec,index}.ts`,
`apps/api/src/app.module.ts`,
`packages/contracts/src/appointments.ts`,
`packages/contracts/src/index.ts`.

**Docs & i18n (bu commit):**
`goals/GOAL-031_COMPLETION_REPORT.md` (bu dosya),
`PROJECT_CONTEXT.md` (⏳ → ✅), `docs/errors/ERROR_CATALOG.md`
(`VET-APPT-0005..0006` eklendi — slot çakışması + state geçişi), 7
API doc (`docs/api/api.{post,get,patch}._api_v1_clinic_appointments*.md`),
`AI_CHUNKS.yaml` (+2 chunk: `flow-appointment-create`,
`flow-appointment-cancel`),
`packages/i18n/src/locales/{tr-TR,en-GB}.json`
(`VET-APPT-0005/0006` çevirileri eklendi).

## Veritabanı

Yok. In-memory `appointmentsByTenant` Map. Production'a geçişte
`Appointment` tablosu + `tenantId/start` index + `patientId` FK +
`veterinarianId` FK (Veteriner modülü sonrası) + audit'e ek
`reason` kolonu.

## API

| Method | Path                                       | Yetki                          | Kod |
| ------ | ------------------------------------------ | ------------------------------ | --- |
| POST   | /api/v1/clinic/appointments                | clinic:appointment:create      | 201 |
| GET    | /api/v1/clinic/appointments                | clinic:appointment:read        | 200 |
| GET    | /api/v1/clinic/appointments/:id            | clinic:appointment:read        | 200 |
| PATCH  | /api/v1/clinic/appointments/:id            | clinic:appointment:update      | 200 |
| POST   | /api/v1/clinic/appointments/:id/cancel     | clinic:appointment:cancel      | 200 |
| POST   | /api/v1/clinic/appointments/:id/complete   | clinic:appointment:complete    | 200 |
| POST   | /api/v1/clinic/appointments/:id/no-show    | clinic:appointment:complete    | 200 |

Hatalar: 404 `VET-CLINIC-0001` (patient/randevu yok / cross-tenant),
404 `VET-AUTHZ-0002` (cross-tenant), 403 `VET-AUTHZ-0001`,
409 `VET-APPT-0005` (slot booked/blocked), 422 `VET-VALIDATION-0009`
(geçmiş/süre), 422 `VET-VALIDATION-0001` (parse), 422
`VET-APPT-0006` (cancelled/completed state geçişi), 400
`VET-TENANT-0001`, 401 `VET-AUTH-0001`.

## Test

16 yeni unit test. Create happy-path + 5 negatif; findById tenant
izolasyonu 2; list filtre 2; update çakışma + notes 2; cancel + idempotent
2; complete 1; noShow 1. Audit event'lerin mock ile doğrulanması.
Başarısız: 0.

## Bilinen riskler

- In-memory storage (pilot); DB persistence FAZ-3+'da.
- Update compensation in-memory senkron varsayımına dayanır; DB'ye
  geçişte transaction sınırı ile korunmalı.
- Veterinarian entity modülü henüz yok; minimum tenant kuralı
  uygulanıyor (FAZ-3+ sıkılaştırılacak).
- `arrived` ve `in_progress` durumları şu an sadece PATCH üzerinden
  set edilebilir; resepsiyon (GOAL-032) için check-in endpoint'i
  eklenecek.

## Sıradaki

FAZ-3 — Randevu + portal. GOAL-032 (bekleme listesi + check-in /
arrived), GOAL-033 (portal kayıt), GOAL-034 (portal hayvan listesi),
GOAL-035 (online randevu talebi), GOAL-036 (hatırlatma).
