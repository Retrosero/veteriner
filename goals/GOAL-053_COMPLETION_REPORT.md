# GOAL-053 — Aşı Hatırlatma Job'u (Completion Report)

## Faz
FAZ-5 (Aşı + stok)

## Özet
Aşı tekrar tarihine (`nextDueAt`) göre otomatik hatırlatma
planlayan ve tenant config'ine göre dispatch eden iş akışı
tamamlandı. In-process queue + 3 denemelik exponential backoff
ile idempotent ve double-send korumalı çalışır.

## Çıktılar

### Core (GOAL-053 core commit `f763f2f`)
- `apps/api/src/modules/vaccines/vaccine-reminders.controller.ts`
  — 4 endpoint (list, config GET/PUT, process).
- `apps/api/src/modules/vaccines/vaccine-reminders.service.ts` —
  8 public metot: scheduleForApplication, cancelForApplication,
  cancelForPatient, rescheduleForApplication, processDueReminders,
  listForPatient, getTenantConfig, updateTenantConfig.
- `apps/api/src/modules/vaccines/vaccine-reminders.repository.ts`
  — in-memory depolama + tenant config UPSERT.
- `apps/api/src/modules/vaccines/vaccine-reminders.service.spec.ts`
  — 30 unit test.
- `apps/api/src/common/vaccines/vaccine-reminder.types.ts` —
  VaccineReminderRecord + VaccineReminderConfig +
  DEFAULT_VACCINE_REMINDER_CONFIG + computeScheduledFor +
  pickStepForApplication + buildVaccineReminderDedupeKey.
- `packages/contracts/src/vaccine-reminder.ts` — Zod şemaları.

### Endpoint'ler (4)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | GET | `/api/v1/clinic/vaccines/reminders/patient/{patientId}` | `clinic:vaccination:read` |
| 2 | GET | `/api/v1/clinic/vaccines/reminders/config` | `clinic:vaccination:read` |
| 3 | PUT | `/api/v1/clinic/vaccines/reminders/config` | `tenant:tenant:update` |
| 4 | POST | `/api/v1/clinic/vaccines/reminders/process` | `clinic:vaccination:read` |

### Döküman (bu commit)
- `docs/api/api.get._api_v1_clinic_vaccines_reminders_patient__patientId_.md`
- `docs/api/api.get._api_v1_clinic_vaccines_reminders_config.md`
- `docs/api/api.put._api_v1_clinic_vaccines_reminders_config.md`
- `docs/api/api.post._api_v1_clinic_vaccines_reminders_process.md`
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-vaccine-reminder` chunk
  v1.0.0; schedule/cancel/reschedule/process hook'larını,
  dispatch kurallarını, idempotency, retry, double-send
  engelini ve audit olaylarını özetler.

## İş Kuralları
- **Snapshot deseni:** reminder kaydında uygulama + step'in
  snapshot'ı tutulur; circular import koruması (vaccine ↔
  reminders).
- **Idempotency:** `buildVaccineReminderDedupeKey` ile
  `(applicationId, stepNumber)` tekil. Aynı uygulama için
  tekrar schedule çağrılırsa no-op.
- **Tenant config:** `daysBeforeDue` 1-90 arası; `channels` 1-3
  eleman (`sms` | `in_app` | `email`). Boş kanal listesi kabul
  edilmez (422 `VET-VALIDATION-0010`).
- **Default config:** 7 gün + `['sms', 'in_app']`.
- **Consent:**
  - `sms` kanalı için `Owner.consent.sms=false` → atla.
  - `email` kanalı için `Owner.consent.email=false` → atla.
  - `in_app` consent kontrolsüz.
  - Tüm kanallar atlanırsa `skipped` sayılır.
- **Idempotent dispatch:** `status='sent'` olanlar asla
  yeniden gönderilmez. `now < scheduledFor` olanlar atlanır.
- **Retry:** exponential backoff ile 3 deneme; tüm denemeler
  başarısızsa `status='failed'` + `lastError` set.
- **Double-send engeli:** `status='sent'` kontrolü.
- **Timezone:** tenant timezone'unda schedule edilir
  (`nextDueAt` UTC, hesaplama `Date` ile).

## Audit
- `audit:vaccine.reminder.schedule` (info) — uygulama
  oluşturulunca hook.
- `audit:vaccine.reminder.cancel` (warning) — uygulama iptali.
- `audit:vaccine.reminder.cancel_patient` (warning) — hasta
  silindi/devredildi.
- `audit:vaccine.reminder.reschedule` (info) — amendment
  sonrası `nextDueAt` değişince.
- `audit:vaccine.reminder.process_due` (info) — her job tick.
- `audit:vaccine.reminder.config.update` (info) — config
  değişince.

## Tenant İzolasyonu
- Tüm sorgular tenant-scoped; UPSERT yapısı
  `actor.tenantId`'ye yazılır.
- `processDueReminders` tenant-bazlı çalışır; tüm tenant'ları
  kapsar (multi-tenant dispatch).
- SUPERADMIN bypass'lı.

## Queue & Retry (FAZ-0)
- In-process queue (FAZ-0); FAZ-10'da BullMQ'ya taşınacak.
- Exponential backoff: 60s, 300s, 1800s.
- 3 deneme sonrası `status='failed'`.

## Yapılmayanlar / Bilinçli Atlamalar
- **BullMQ geçişi** → FAZ-10 planı.
- **Tenant timezone UI** → şu an `nextDueAt` UTC, gösterim
  frontend'de dönüştürülecek.
- **Reminder locale** → mesaj gövdesi `tr-TR` hard-coded;
  ileride template'li (GOAL-005 RAG) çözüm.
- **Suppression list (müşteri "daha sonra gönder")** →
  sonraki faz.
- **Cron schedule** → controller process endpoint'i manuel
  çağrı için; otomatik cron FAZ-10'da eklenecek (her 5dk).

## Döküman Uyum
- `pnpm docs:check` → mevcut pre-existing hatalar (FAZ-6 +
  GOAL-054 vaccine code'ları). **GOAL-053 özgü hata yok.**

## Testler
- `vaccine-reminders.service.spec.ts` → 30 test (core commit'te).
- Tam API test suite: 624/624 geçti (core commit'te).

## Sonraki Adımlar
- GOAL-054 (aşı amendment) docs/i18n.
- FAZ-5 kapanış: tüm dökümanlar tamam.
- GOAL-060+ (FAZ-6 stok).

## Commit
- Core: `f763f2f` — `GOAL-053 aşı hatırlatma job'u (core)`
- Docs/i18n: (bu commit) — `docs(vaccines): GOAL-053 aşı
  hatırlatma doküman ve i18n tamamla`
