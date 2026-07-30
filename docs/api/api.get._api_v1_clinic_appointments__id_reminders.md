# GET /api/v1/clinic/appointments/:id/reminders

Bir randevuya ait hatırlatma kayıtlarını tenant-scoped listeler.
Planlanmış, gönderilmiş, başarısız veya iptal edilmiş tüm
hatırlatmaları döner; `status` filtresi opsiyonel. Cross-tenant → 404
(appointment kendi tenant'ına ait değilse repository boş döner;
controller randevuyu ayrıca doğrulamaz — kullanıcı kendi tenant'ında
sorgu atıyor varsayımı).

- **Modül:** appointment-reminders
- **Yetki:** `clinic:appointment:read` (STAFF / VETERINARIAN / OWNER)
- **Audit:** YAYINLAMAZ (read-only).
- **Idempotency:** N/A (GET).

## Request

**Path params:**

- `id` (string, zorunlu) — `appt-<uuidv4>` formatında randevu ID.

**Query params** (Zod `reminderListQuerySchema`):

- `status` (enum, opsiyonel) — `scheduled | sent | failed | cancelled`.
- `limit` (int, opsiyonel, 1-200, default 50).
- `offset` (int, opsiyonel, min 0, default 0).

## Response

**200 OK** — `{ items: ScheduledReminder[], total: number }`.

```json
{
  "items": [
    {
      "id": "rem-tenant8-uuid8",
      "tenantId": "tnt-uuid",
      "appointmentId": "appt-uuid",
      "channel": "sms",
      "scheduledFor": "2026-07-31T10:00:00.000Z",
      "status": "scheduled",
      "attempts": 0,
      "lastError": null,
      "sentAt": null,
      "createdAt": "2026-07-30T11:30:00.000Z"
    },
    {
      "id": "rem-tenant8-uuid8",
      "tenantId": "tnt-uuid",
      "appointmentId": "appt-uuid",
      "channel": "in_app",
      "scheduledFor": "2026-07-31T10:00:00.000Z",
      "status": "sent",
      "attempts": 1,
      "lastError": null,
      "sentAt": "2026-07-31T10:00:05.120Z",
      "createdAt": "2026-07-30T11:30:00.000Z"
    }
  ],
  "total": 2
}
```

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-VALIDATION-0001` (400) — Query Zod parse hatası (status
  enum dışı, limit aralık dışı).
- `VET-TENANT-0001` (400) — Aktif tenant bağlamı zorunlu
  (actor.tenantId boş).

## Tenant izolasyonu

`AppointmentRemindersService.requireTenantScope(actor, tenantId)` her
çağrıda uygulanır. SUPERADMIN bypass; diğer roller için
`actor.tenantId === tenantId` zorunlu. Repository tüm okuma
fonksiyonlarında `tenantId` filtresi uygular; cross-tenant ID → boş
liste (bilgi sızdırmaz).

## Kullanım senaryoları

- Resepsiyon ekranı: belirli bir randevanın hatırlatma gönderim
  geçmişini görüntüleme.
- Operasyon paneli: bugün gönderilecek hatırlatmaların önizlemesi
  (`status=scheduled` filtresi).
- Vaka inceleme: gönderilmemiş/başarısız hatırlatmaların tespiti
  (`status=failed`).

## Dikkat edilecek noktalar

- **Hook tetiklemeli:** Bu endpoint schedule/iptal etmez. Schedule
  yalnızca `AppointmentsService.create` → `scheduleForAppointment`
  üzerinden otomatik gerçekleşir. Cancel/reschedule de
  `AppointmentsService.{cancel,update}` hook'larından tetiklenir.
- **Boş liste ≠ 404:** Randevu ID'si kendi tenant'ında mevcut değilse
  repository boş döner; 404 atmaz. (Bilgi sızdırmama: randevu
  varlığı/tekniği sızdırılmaz.)
- **Sıralama:** Repository `createdAt DESC` döner (FAZ-0 pilot);
  FAZ-11+ DB'ye geçişte `(scheduledFor ASC, channel)` önerilir.
- **`total`:** Filtre uygulanmış toplam; pagination client
  tarafında `limit + offset` ile yönetilir.

## İlgili dokümanlar

- API sözleşmesi: `packages/contracts/src/appointment-reminder.ts`
  (`reminderListQuerySchema`, `ScheduledReminder`).
- Service: `apps/api/src/modules/appointment-reminders/appointment-reminders.service.ts`
  → `listForAppointment`.
- Process: `POST /api/v1/clinic/appointment-reminders/process` (admin
  job endpoint'i).
- AI chunk: `reminder-overview` (yakında `docs/ai/AI_CHUNKS.yaml`).
- Modül: `appointment-reminders`
