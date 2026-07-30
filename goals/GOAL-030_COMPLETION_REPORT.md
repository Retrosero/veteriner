# GOAL-030 Completion Report — Klinik takvimi

- Goal no: GOAL-030
- Başlık: Klinik takvimi (calendar / working hours / slot blocking)
- Faz: FAZ-3 (Randevu + portal)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: ca34b25

## Yapılan işler (core, ca34b25)

**CalendarService** (`apps/api/src/modules/calendar/calendar.service.ts`)
— 4 public metot. (1) `getDay(tenantId, date, query, actor)`:
`YYYY-MM-DD` tarihten `dayOfWeek` hesaplanır, tenant+veteriner
working hours Map'te yoksa **Pzt-Cum 09:00-17:00, 30 dk** default
uygulanır; slot'lar `slotDurationMin` aralıklarla üretilir; booked
(`bookedSlots` Map) ve blocked (`blockedById` Map, interval overlap)
kesişimine göre `available|booked|blocked` atanır; audit
**YAYINLAMAZ** (gürültü kontrolü). (2) `setWorkingHours(tenantId,
input, actor)`: tenant (veya `veterinarianId`) için haftalık tanımı
günceller; mevcut booked/blocked ETKİLENMEZ, yalnızca gelecekte üretilen
slot'lar yeni kuralla hesaplanır; audit
`audit:calendar.hours.update` (info). (3) `blockSlot(tenantId, input,
actor)`: mola/izin aralığı ekler; `end <= start` → 422
`VET-APPT-0001`; audit `audit:calendar.block` (info). (4)
`unblockSlot(tenantId, blockId, actor)`: blockId cross-tenant veya
yok → 404 `VET-APPT-0002`; audit `audit:calendar.unblock` (info).

**CalendarController** — 4 endpoint
(`apps/api/src/modules/calendar/calendar.controller.ts`):
- `GET    /api/v1/calendar/days/:date?veterinarianId=...` —
  `clinic:appointment:read`, 200.
- `PUT    /api/v1/calendar/working-hours` —
  `tenant:tenant:update`, 200.
- `POST   /api/v1/calendar/block` — `tenant:tenant:update`, 201.
- `DELETE /api/v1/calendar/block/:id` — `tenant:tenant:update`, 200.
  Swagger `operationId: calendarGetDay | calendarSetWorkingHours |
  calendarBlockSlot | calendarUnblockSlot`. `ZodValidationPipe` ile
  input doğrulama; `requireTenant()` tenant bağlamı zorunlu
  (`VET-TENANT-0001`).

**Sözleşme** (`packages/contracts/src/calendar.ts`) — 9 Zod şeması:
`calendarSlotStatusSchema` (available|booked|blocked), `dayOfWeekSchema`
(0-6), `hhmmSchema` (HH:mm), `workingHoursSchema`, `calendarSlotSchema`,
`calendarDaySchema`, `setWorkingHoursInputSchema`, `blockSlotInputSchema`,
`getDayQuerySchema` / `getDayParamsSchema` / `unblockSlotParamsSchema`,
`blockedSlotResponseSchema`.

**13 yeni test** (`calendar.service.spec.ts`):
(1) getDay default 09-17 + 30dk → 16 slot (Pzt),
(2) booked slot → `status=booked` + `appointmentId`,
(3) blocked slot → `status=blocked`,
(4) cross-tenant → 403 `VET-AUTHZ-0001`,
(5) SUPERADMIN her tenant'a erişir,
(6) `veterinarianId` filtresi yalnızca o vet'in saatlerini üretir,
(7) Pazar default çalışılmaz → 0 slot,
(8) setWorkingHours başarı + audit,
(9) setWorkingHours aynı gün 2 kez → 422 `VET-APPT-0003`,
(10) blockSlot başarı + audit,
(11) blockSlot `end <= start` → 422 `VET-APPT-0001`,
(12) unblockSlot başarı + audit,
(13) unblockSlot cross-tenant blockId → 404 `VET-APPT-0002`.

## Tasarım kararları

- **Default çalışma saati:** Tenant+veteriner için kayıt yoksa Pzt-Cum
  09:00-17:00 / 30 dk. Klinik, çalışma saatini hiç ayarlamasa bile
  takvim çalışır. Pazar default kapalıdır.
- **Booked slot'lar in-memory:** GOAL-031 Appointment modeli henüz
  tanımlı değil. `bookedSlots` Map'inde tutulur; service
  `seedBookedSlot()` test yardımcısı ile doldurulur. FAZ-3+
  Appointment tablosuna bağlanır.
- **Mevcut booking/blocking etkilenmez:** `setWorkingHours` gün içi
  değişikliklerde aktif slot'ları bozmaz; yalnızca gelecekte üretilen
  slot'lar yeni kuralla hesaplanır. Bu davranış appointment
  scheduling'in bozulmasını engeller.
- **Cross-tenant block IDOR koruması:** `unblockSlot` blockId'yi
  tenant filtresiyle arar; uyuşmazlık 404 (`VET-APPT-0002`) döner,
  bilgi sızdırmaz.
- **Slot durum önceliği:** booked > blocked > available. Bir slot
  hem booked hem blocked aralıkla kesişirse booked kabul edilir.
- **Audit seviyesi:** takvim okuma (getDay) audit YAYINLAMAZ; yalnızca
  `hours.update`, `block`, `unblock` (hepsi info). Bu gürültü
  kontrolüdür; read-heavy endpoint'lerin audit'ı şişirmesi engellenir.
- **Çakışma kontrolü:** Slot üretim aşamasında yapılmaz; appointment
  oluşturma (GOAL-031) burada üretilen `booked` durumuna güvenir.
  Block aralık overlap'i interval kesişimi ile yapılır.

## Değişen dosyalar

**Core (ca34b25):**
`apps/api/src/modules/calendar/{calendar.module,calendar.controller,
calendar.service,calendar.service.spec,index}.ts`,
`apps/api/src/common/calendar/calendar.types.ts`,
`apps/api/src/app.module.ts`,
`packages/contracts/src/calendar.ts`,
`packages/contracts/src/index.ts`.

**Docs & i18n (bu commit):**
`goals/GOAL-030_COMPLETION_REPORT.md` (bu dosya),
`PROJECT_CONTEXT.md` (⏳ → ✅), `docs/errors/ERROR_CATALOG.md`
(`VET-APPT-0001..0004` mesajları calendar semantiğine düzeltildi —
core'da kullanıldığı şekliyle), 4 API doc
(`docs/api/api.{get,put,post,delete}._api_v1_calendar_*.md`),
`AI_CHUNKS.yaml` (+1 chunk: `calendar-overview`),
`packages/i18n/src/locales/{tr-TR,en-GB}.json`
(`VET-APPT-0001..0004` çevirileri düzeltildi).

## Veritabanı

Yok. In-memory `workingHoursByTenant` Map + `bookedSlots` Map +
`blockedById` Map. Production'a geçişte `WorkingHours`,
`BlockedSlot` tabloları + `tenantId/veterinarianId/start` index'leri
+ Appointment modeli ile `bookedSlots` derive.

## API

| Method | Path                                       | Yetki                    | Kod |
| ------ | ------------------------------------------ | ------------------------ | --- |
| GET    | /api/v1/calendar/days/:date                | clinic:appointment:read  | 200 |
| PUT    | /api/v1/calendar/working-hours             | tenant:tenant:update     | 200 |
| POST   | /api/v1/calendar/block                     | tenant:tenant:update     | 201 |
| DELETE | /api/v1/calendar/block/:id                 | tenant:tenant:update     | 200 |

Hatalar: 404 `VET-APPT-0002` (block bulunamadı / cross-tenant),
422 `VET-APPT-0001` (geçersiz zaman aralığı), 422 `VET-APPT-0003`
(geçersiz çalışma saati), 422 `VET-APPT-0004` (geçersiz tarih),
403 `VET-AUTHZ-0001`, 400 `VET-TENANT-0001`, 400
`VET-VALIDATION-0001`, 401 `VET-AUTH-0001`.

## Test

13 yeni unit test. Varsayılan çalışma saati, booked/blocked slot
durumları, cross-tenant guard, SUPERADMIN bypass, Pazar 0-slot,
`setWorkingHours` çakışma + audit, `blockSlot` aralık + audit,
`unblockSlot` başarı + audit + cross-tenant 404. Başarısız: 0.

## Bilinen riskler

- In-memory storage (pilot); DB persistence FAZ-3+'da.
- Booked slot'lar Map'te; FAZ-3+ Appointment modeli ile birleşir.
- Sürükle-bırak UI henüz yok (FAZ-3+ web).
- Oda ve randevu tipi filtresi (Pzt-Cum default saatler dışında)
  FAZ-3+ değerlendirilir.

## Sıradaki

FAZ-3 — Randevu + portal. GOAL-031 (Appointment oluşturma + yönetim
+ booked slot Map'ten Appointment modeline geçiş), GOAL-032
(bekleme listesi), GOAL-035 (online randevu talebi).
