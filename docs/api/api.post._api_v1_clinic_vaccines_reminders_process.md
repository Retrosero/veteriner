# POST /api/v1/clinic/vaccines/reminders/process

Zamanı gelen aşı hatırlatmalarını dispatch eder. Job / cron
tarafından tetiklenir. `now >= scheduledFor` ve
`status='scheduled'` olan reminder'lar sırayla işlenir.

- **Modül:** vaccines (vaccine-reminders)
- **Yetki:** `clinic:vaccination:read` (cron service account)
- **Audit:** `audit:vaccine.reminder.process_due` (info,
  payload'da processed/sent/failed/skipped sayaçları)

**Request body:** yok.

**Response 200:**

```json
POST /api/v1/clinic/vaccines/reminders/process
{
  "processed": 12,
  "sent": 10,
  "failed": 1,
  "skipped": 1
}
```

- `processed` (integer) — bu turda ele alınan toplam reminder.
- `sent` (integer) — başarıyla dispatch edilen.
- `failed` (integer) — NotificationService.send başarısız
  olanlar (status='failed', `lastError` set edilir).
- `skipped` (integer) — consent yetersiz (örn. sms için
  `consent.sms=false`) nedeniyle atlananlar; kanal kümesinden
  çıkarılarak `in_app`'e düşürülmüş olabilir.

**Çalışma kuralları (service):**

- Tenant bazlı, tüm tenant'ları kapsar (multi-tenant dispatch).
- `NotificationService.send` üzerinden kanal kanal dispatch:
  - `sms` kanalı için `Owner.consent.sms=false` → atla (in_app'e
    düşürülür veya tüm kanallar atlanırsa skipped).
  - `email` için `Owner.consent.email=false` → atla.
  - `in_app` için consent kontrolü yoktur (uygulama içi
    bildirim).
- Idempotency: aynı `id` ile yeniden çağrıldığında
  `status='sent'` olanlar atlanır; `status='scheduled'` ve
  `scheduledFor > now` olanlar atlanır.
- Retry: dispatch başarısızsa `attempts++` ve exponential
  backoff ile 3 deneme; tüm denemeler başarısızsa
  `status='failed'`.
- Double-send engeli: `status='sent'` olanlar asla yeniden
  gönderilmez.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.

**Tenant izolasyonu:** SUPERADMIN veya service-account rolü
gerekir; normal kullanıcı 403 alır.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine-reminder.ts`
- Config: `GET/PUT /api/v1/clinic/vaccines/reminders/config`
- Liste: `GET /api/v1/clinic/vaccines/reminders/patient/{patientId}`
- AI chunk: `flow-vaccine-reminder`
- Audit event: `audit:vaccine.reminder.process_due`
