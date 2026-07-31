# GET /api/v1/clinic/vaccines/reminders/config

Tenant için aşı hatırlatma config'ini getirir. Kayıt yoksa
default değerler döner: `daysBeforeDue=7` + `channels=['sms',
'in_app']`.

- **Modül:** vaccines (vaccine-reminders)
- **Yetki:** `clinic:vaccination:read`
- **Audit:** yok (salt okunur)

**Response 200 (`VaccineReminderConfig`):**

```json
GET /api/v1/clinic/vaccines/reminders/config
{
  "tenantId": "tnt-uuid",
  "daysBeforeDue": 7,
  "channels": ["sms", "in_app"],
  "updatedAt": "2026-07-30T12:00:00.000Z",
  "updatedBy": "usr-uuid"
}
```

- `daysBeforeDue` (integer, 1-90) — `nextDueAt`'ten kaç gün
  önce hatırlatma gönderileceği.
- `channels` (array, 1-3 eleman) — `sms` | `in_app` | `email`
  kombinasyonu.
- `updatedAt`, `updatedBy` — son güncelleme bilgisi.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.

**Tenant izolasyonu:** Ayar tenant-scoped tek satır; başka
tenant'ın ayarı görünmez. SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine-reminder.ts`
- Güncelle: `PUT /api/v1/clinic/vaccines/reminders/config`
- Liste: `GET /api/v1/clinic/vaccines/reminders/patient/{patientId}`
- Process: `POST /api/v1/clinic/vaccines/reminders/process`
- AI chunk: `flow-vaccine-reminder`
