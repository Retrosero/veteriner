# POST /api/v1/clinic/appointment-reminders/process

Zamanı gelmiş (`now >= scheduledFor` ve `status='scheduled'`) tüm
hatırlatmaları tüm tenant'larda işler. Sistem/cron job çağrısı için
tasarlanmış admin endpoint'idir. FAZ-3'te manuel tetikleme veya test
çağrısı; BullMQ worker Faz 11+'da bu endpoint'i periyodik olarak
çağıracak.

- **Modül:** appointment-reminders
- **Yetki:** `clinic:appointment:read` (STAFF / VETERINARIAN / OWNER
  — admin/system çağrısı için gerekli; ileride sistem rolü ayrılacak)
- **Audit:** `audit:appointment_reminder.process_due` (SYSTEM actor,
  info veya failed>0 ise warning).
- **Idempotency:** İşlem `due` listesini okur, status günceller; aynı
  çağrı tekrarında zaten `sent/failed/cancelled` olanlar atlanır
  (`status='scheduled'` filtresi sayesinde).

## Request

**Body:** Yok.

**Query params:** Yok.

## Response

**200 OK** — `{ processed, sent, failed, skipped }`.

```json
{
  "processed": 12,
  "sent": 10,
  "failed": 1,
  "skipped": 1
}
```

- `processed`: `due` listesinden işlenen kayıt sayısı (batch üst sınır
  100; FAZ-0 pilot).
- `sent`: notification başarıyla gönderildi (`status='sent'`).
- `failed`: notification gönderilemedi (`status='failed'`); hata
  `lastError` alanına yazılır.
- `skipped`: snapshot eksik / appointment status uyumsuz
  (`cancelled|completed|no_show`) / opt-out / `queued|sending`
  intermediate state.

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.

## Çalışma modeli

Her `due` kaydı için sırasıyla:

1. **Snapshot kontrolü** — `scheduleForAppointment` sırasında
   repository'ye kopyalanan appointment metadata okunur. Snapshot
   yoksa `attempts++` + `lastError="missing_snapshot"` + skip.
2. **Appointment status guard** — `cancelled|completed|no_show`
   randevuya hatırlatma gitmez; reminder `cancelled` yapılır
   (`lastError="appointment_status_<status>"`).
3. **Patient/owner çözümü** — `rec.tenantId` altında
   `PatientsService.findById` + `OwnersService.findById` SYSTEM
   actor ile. Bulunamazsa `status='failed'` + `lastError`.
4. **Locale resolve** — `TenantService.resolveLocale` (tr-TR / en-GB).
5. **Consent** — `ConsentService.canSend(userId, channel,
   "appointment_reminder")` — opt-out → `cancelled` (`opted_out`).
6. **Notification dispatch** — `NotificationsService.send` ile
   `idempotencyKey="appt-reminder|{id}"`. Sonuç:
   - `sent` → `status='sent'`, `sentAt=<now>`.
   - `failed` → `status='failed'`, `lastError=<msg>`.
   - `opted_out` → `status='cancelled'`, `lastError="opted_out"`.
   - `queued|sending` → `attempts++`, `lastError=notification_<status>`,
     job tekrar çalışacak.
7. **Audit** — Toplu SYSTEM audit `process_due` event'i
   (`metadata: { processed, sent, failed, skipped, at }`).

## Kullanım senaryoları

- Manuel operational trigger (admin UI "reminder'ları şimdi işle"
  butonu).
- Test: e2e testlerde hatırlatma akışının tamamını doğrulamak için.
- Faz 11+ BullMQ worker — `Cron("*/5 * * * *")` ile periyodik çağrı.

## Dikkat edilecek noktalar

- **Multi-tenant:** Endpoint tenant-bağlamı zorunlu değildir
  (`actor.tenantId` opsiyonel). Repository `listDue(now)` tüm
  tenant'lardan `scheduled` kayıtları döner.
- **Batch sınırı:** `DUE_BATCH_SIZE = 100`. Faz 11+ worker'ı paging
  ile tamamlanmamış işler için tekrar çağırabilir.
- **Snapshot güvenliği:** Appointment metadata tenant-scoped
  repository'den gelir; cross-tenant bilgi sızdırmaz.
- **Idempotency:** Aynı `id` için iki kez `send` çağrısı
  `idempotencyKey` sayesinde notification tarafında tekilleşir.
- **SYSTEM audit:** `actorId: "system"`, `actorType: "system"`,
  `correlationId: "system-job"`. Bu audit log Superadmin hata
  merkezinde filtrelenebilir.
- **PII:** Audit metadata'da PII (hasta sahibi adı, telefon) yer
  almaz; yalnızca `appointmentId`, `channel`, `scheduledFor` gibi
  operasyonel alanlar.

## İlgili dokümanlar

- API sözleşmesi: `packages/contracts/src/appointment-reminder.ts`.
- Service: `apps/api/src/modules/appointment-reminders/appointment-reminders.service.ts`
  → `processDueReminders`.
- Repository: `appointment-reminders.repository.ts` → `listDue`,
  `update`.
- Liste: `GET /api/v1/clinic/appointments/:id/reminders`.
- AI chunk: `reminder-overview` (`docs/ai/AI_CHUNKS.yaml`).
- NotificationsService: `apps/api/src/modules/notifications/notifications.service.ts`.
- Audit event: `audit:appointment_reminder.process_due`
  (`docs/errors/AUDIT_EVENTS.yaml`).
