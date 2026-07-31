# PUT /api/v1/clinic/vaccines/reminders/config

Tenant için aşı hatırlatma config'ini günceller. `daysBeforeDue`
1-90 arasında, `channels` 1-3 elemanlı bir dizi olmalıdır.
Aksi hâlde 422 `VET-VALIDATION-0010`.

- **Modül:** vaccines (vaccine-reminders)
- **Yetki:** `tenant:tenant:update` (yüksek yetki)
- **Audit:** `audit:vaccine.reminder.config.update` (info)

**Request body (`VaccineReminderConfigInput`):**

```json
PUT /api/v1/clinic/vaccines/reminders/config
{
  "daysBeforeDue": 14,
  "channels": ["sms", "in_app", "email"]
}
```

- `daysBeforeDue` (integer, 1-90) zorunlu.
- `channels` (array, 1-3 eleman) zorunlu — `sms` | `in_app` |
  `email`.

**Response 200 (`VaccineReminderConfig`):**

```json
{
  "tenantId": "tnt-uuid",
  "daysBeforeDue": 14,
  "channels": ["sms", "in_app", "email"],
  "updatedAt": "2026-07-30T12:30:00.000Z",
  "updatedBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch
  (yüksek yetki gerekir).
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası (Zod).
- `VET-VALIDATION-0010` (422) — `daysBeforeDue` 1-90 dışı VEYA
  kanal listesi 0/4+ eleman.

**Tenant izolasyonu:** UPSERT yapısı `actor.tenantId`'ye yazılır;
başka tenant'ın ayarı değiştirilemez. SUPERADMIN bypass'lı.

**Audit detayı:**

- Önceki ve yeni `daysBeforeDue` + `channels` payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine-reminder.ts`
- Getir: `GET /api/v1/clinic/vaccines/reminders/config`
- AI chunk: `flow-vaccine-reminder`
- Audit event: `audit:vaccine.reminder.config.update`
