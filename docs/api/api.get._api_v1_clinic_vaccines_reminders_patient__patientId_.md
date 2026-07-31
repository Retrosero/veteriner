# GET /api/v1/clinic/vaccines/reminders/patient/{patientId}

Bir hastanın aşı hatırlatmalarını listeler. Tenant-scoped
reminder listesi; status, limit, offset + protokol/uygulama
filtreleri destekler. Cross-tenant patientId → 404
`VET-CLINIC-0001`.

- **Modül:** vaccines (vaccine-reminders)
- **Yetki:** `clinic:vaccination:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `patientId` (string, 1-100) zorunlu.

**Query parametreleri (`VaccineReminderListQuery`):**

- `status` (enum: `scheduled|sent|failed|cancelled`, opsiyonel).
- `protocolId` (string, 1-100, opsiyonel) — belirli bir
  protokolün hatırlatmaları.
- `applicationId` (string, 1-100, opsiyonel) — belirli bir
  uygulamanın hatırlatmaları.
- `limit` (integer, 1-200, default 50) — sayfa boyutu.
- `offset` (integer, ≥0, default 0) — sayfa offset.

**Response 200:**

```json
GET /api/v1/clinic/vaccines/reminders/patient/pat-uuid?status=scheduled&limit=20
{
  "items": [
    {
      "id": "vrmr-tnt12345-000001",
      "tenantId": "tnt-uuid",
      "patientId": "pat-uuid",
      "applicationId": "vacr-tnt12345-000001",
      "protocolId": "vacp-tnt12345-000001",
      "stepNumber": 2,
      "dueAt": "2026-08-14T09:00:00.000Z",
      "scheduledFor": "2026-08-07T09:00:00.000Z",
      "status": "scheduled",
      "channels": ["sms", "in_app"],
      "consentSnapshot": {
        "marketing": false,
        "sms": true,
        "email": true
      },
      "attempts": 0,
      "lastError": null,
      "sentAt": null,
      "cancelledAt": null
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası (Zod).
- `VET-CLINIC-0001` (404) — Hayvan bulunamadı (cross-tenant
  dahil).

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; cross-tenant
patientId → null (bilgi sızdırmaz). SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine-reminder.ts`
- Config: `GET/PUT /api/v1/clinic/vaccines/reminders/config`
- Process: `POST /api/v1/clinic/vaccines/reminders/process`
- AI chunk: `flow-vaccine-reminder`
- Audit event: `audit:vaccine.reminder.schedule/cancel/...`
