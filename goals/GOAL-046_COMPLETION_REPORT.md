# GOAL-046 Completion Report — Kontrol randevusu oluşturma

- Goal no: GOAL-046
- Başlık: Kontrol randevusu oluşturma (Follow-up)
- Faz: FAZ-4 (Klinik muayene/aşı/reçete)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 89d0f21

## Yapılan işler (core)

**FollowupsService** (`apps/api/src/modules/followups/followups.service.ts`):

- **`scheduleFromExamination(tenantId, examinationId, followUpDate, veterinarianId?, notes?, actor)`** — Examination
  `ExaminationsService.findById(tenantId, id, actor)` ile aynı tenant'ta
  mı doğrulanır (cross-tenant → 404 `VET-CLINIC-0001`).
  `followUpDate` gelecekte mi (geçmiş/invalid → 422
  `VET-VALIDATION-0009`). Veterinarian `veterinarianId` override
  varsa o, yoksa `examination.veterinarianId`; ikisi de yoksa 422
  `VET-VALIDATION-0009`. `AppointmentsService.create(tenantId,
{ type:'follow_up', durationMin:30, notes:'[Kontrol Randevusu] …' },
actor)` ile randevu yaratır (calendar uygunluk kontrolü dahil).
  Audit `audit:followup.create` (info) — `source: 'examination'`,
  examinationId, patientId, veterinarianId, start, end, type.
- **`scheduleFromPrescription(tenantId, prescriptionId, followUpDate, notes?, actor)`** — Prescription
  `PrescriptionsService.findById(tenantId, id, actor)` ile cross-tenant
  → 404 `VET-CLINIC-0001`. `followUpDate` gelecekte mi (422). Hasta
  ve veteriner reçeteden türetilir (override yok). Yine
  `AppointmentsService.create` ile `type='follow_up'` randevu. Audit
  `audit:followup.create` (info) — `source: 'prescription'`.
- **`listPending(tenantId, patientId, actor)`** —
  `AppointmentsService.list` ile `status='scheduled'`, `from=now`,
  `patientId` filtreli sorgu; response `type==='follow_up'` ile
  in-memory filtrelenir. `limit:200, offset:0` (üst sınır).

**Sözleşme** (`packages/contracts/src/followup.ts`):
`followUpFromExaminationInputSchema` (`followUpDate` ISO datetime,
`veterinarianId?` string, `notes?` max 2000),
`followUpFromPrescriptionInputSchema` (`followUpDate`, `notes?`),
ilgili TS tipleri. Zod `.strict()`.

**FollowupsController** — 3 endpoint (`@Controller("api/v1/clinic")`):

- `POST /api/v1/clinic/examinations/{id}/followup`
  (`followupScheduleFromExamination`, `@HttpCode(201)`, yetki
  `clinic:appointment:create`).
- `POST /api/v1/clinic/prescriptions/{id}/followup`
  (`followupScheduleFromPrescription`, `@HttpCode(201)`, yetki
  `clinic:appointment:create`).
- `GET  /api/v1/clinic/patients/{id}/followups`
  (`followupListPending`, yetki `clinic:appointment:read`).

**11 unit test** (`followups.service.spec.ts`): scheduleFromExamination
başarı + 30dk default + `[Kontrol Randevusu]` notes + audit, vet
override kullanımı, cross-tenant → 404, geçmiş tarih → 422;
scheduleFromPrescription başarı + patient+vet prescription'dan +
audit, cross-tenant → 404, geçmiş → 422; listPending `follow_up` +
gelecek filtresi, boş liste; tenant scope uyuşmazlığı → 403; audit
başına 1 kez `audit:followup.create` çağrı sayacı.

## Tasarım kararları

- **Appointment tipi ayrımı:** Kontrol randevusu ayrı bir entity
  değil, `Appointment.type='follow_up'` olarak materialize edilir.
  Böylece calendar/reminder/online-talep akışları (GOAL-031/032/035)
  tek randevu modeli üzerinden çalışır; sadece tip bazlı raporlama
  eklenir.
- **30 dk default duration:** Kontrol muayeneleri kısa tutulur;
  servis sabit 30 dk. İleride `durationMin` input alanı eklenirse
  override mümkün.
- **Not ön-eki:** Appointment `notes` alanına `[Kontrol Randevusu] …`
  prefix'i otomatik yazılır; UI'da normal appointment'lardan
  görsel ayrım sağlar.
- **Cross-tenant koruması:** Examination/prescription
  `findById(tenantId, id, actor)` cross-tenant → null → 404
  `VET-CLINIC-0001` (bilgi sızdırmaz). `listPending` de
  `requireTenantScope` ile tenant-scoped.
- **Geçmiş tarih reddi:** `requireFutureDate` (şu andan <= ise 422);
  invalid datetime parse → aynı hata. Klinisyen geçmişe kontrol
  planlayamaz; tarih değişikliği için mevcut randevuyu iptal et +
  yeniden oluştur.
- **Audit severity:** Her başarılı schedule **info**; `source`
  (`examination` | `prescription`) ile ayırt edilebilir. `listPending`
  okuma → audit yok.
- **AppointmentsService yeniden kullanımı:** Yeni bir create yolu
  açılmadı; slot uygunluk kontrolü, idempotency, status geçişleri
  zaten `AppointmentsService.create` üzerinden gelir. Bu sayede
  follow-up oluşturma, normal randevu ile aynı sözleşmeye tabi.
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride.

## Doküman ve i18n (bu PR)

- `docs/api/api.post._api_v1_clinic_examinations__id_followup.md`
- `docs/api/api.post._api_v1_clinic_prescriptions__id_followup.md`
- `docs/api/api.get._api_v1_clinic_patients__id_followups.md`
- `docs/ai/AI_CHUNKS.yaml` (`flow-followup` chunk'ı eklendi)
- `goals/GOAL-046_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (Faz 4 / GOAL-046 satırı ✅)

Hata kataloğu: yeni hata kodu eklenmedi (mevcut `VET-CLINIC-0001`,
`VET-VALIDATION-0009`, `VET-AUTHZ-0001`, `VET-TENANT-0001`,
`VET-AUTH-0001` kullanıldı). i18n: yeni anahtar eklenmedi
(mevcut error.* anahtarları yeterli).

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma, `type`/`patientId`/`start`
  index).
- Frontend follow-up CTA (muayene/reçete detayında "Kontrol planla"
  butonu + tarih picker).
- Reminder tetikleme (kontrol randevusuna özel mesaj şablonu —
  GOAL-036 hatırlatma altyapısı kullanılabilir).
- `durationMin` override alanı (sabit 30 dk → input).
- İptal/erteleme endpoint'i (`Appointment` üzerinden generic cancel
  kullanılabilir; follow-up'a özel akış yok).
- Hasta sahibi portalından online kontrol talebi (GOAL-035 benzeri).
