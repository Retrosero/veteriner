# GET /api/v1/clinic/patients/{id}/followups

Hastanın (patient) bekleyen kontrol randevularını listeler.
Filtre: `status='scheduled'`, `type='follow_up'`, `start > now`.
Sonuç `Appointment[]` olarak döner; randevu zamanına göre artan
sırada gelir. `AppointmentsService.list` üzerinden tenant-scoped
olarak sorgulanır, ardından in-memory `type` filtresi uygulanır.

- **Modül:** followups
- **Yetki:** `clinic:appointment:read` (STAFF / VETERINARIAN / OWNER)
- **Audit:** YAYINLAMAZ (read-heavy; gürültü kontrolü).

**Path params:**

- `id` (string, zorunlu) — Hasta ID'si (UUID).

**Response 200 (`Appointment[]`):**

```json
[
  {
    "id": "appt-7a1b2c3d-000123",
    "tenantId": "tnt-uuid",
    "patientId": "33333333-3333-3333-333333333333",
    "veterinarianId": "usr-vet-uuid",
    "type": "follow_up",
    "status": "scheduled",
    "start": "2026-08-15T10:00:00.000Z",
    "end": "2026-08-15T10:30:00.000Z",
    "durationMin": 30,
    "notes": "[Kontrol Randevusu] Antibiyotik tedavisi sonrası kontrol.",
    "createdAt": "2026-07-30T12:00:00.000Z",
    "updatedAt": "2026-07-30T12:00:00.000Z"
  }
]
```

- Liste boşsa `[]` döner; hata değildir.
- Üst sınır: `limit:200`. Daha geniş aralıklar için sayfalama
  (`offset`) kullanılmaz; klinik kullanım senaryosu tek bakışta
  görüntüleme varsayımıyla kısa tutulmuştur.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- Hasta ID'si geçersiz (parse hatası) durumunda 422
  `VET-VALIDATION-0001` döner; hasta kaydı başka tenant'ta ise
  boş liste (bilgi sızdırmaz).

**İş kuralları:**

- `AppointmentsService.list(tenantId,
  { patientId, status:'scheduled', from: now, limit:200, offset:0 },
  actor)` çağrılır; tenant kapsamı enforce edilir.
- Response sonradan `a.type === 'follow_up'` filtresi ile
  daraltılır. Tamamlanmış (`completed`), iptal (`cancelled`) veya
  gelmiş (`no_show`) randevular dahil edilmez.
- Geçmiş kontrol randevuları (başlangıç zamanı `now`'dan küçük)
  dahil edilmez; bunlar için `GET /api/v1/clinic/appointments`
  kullanılabilir (`from`/`to` filtresi).
- `notes` alanındaki `[Kontrol Randevusu]` prefix'i UI'da listeleme
  sırasında görsel ayrım için kullanılabilir.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`. Hasta ID farklı tenant'a aitse, tenant-scoped
list boş döner (404 sızdırmaz).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/followup.ts`
- Muayeneden kontrol: `POST /api/v1/clinic/examinations/{id}/followup`
- Reçeteden kontrol: `POST /api/v1/clinic/prescriptions/{id}/followup`
- Appointment listesi: `GET /api/v1/clinic/appointments`
- AI chunk: `flow-followup`
