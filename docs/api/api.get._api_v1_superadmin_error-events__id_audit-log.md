# GET /api/v1/superadmin/error-events/{id}/audit-log

Bir hata olayının tüm aksiyonlarını (status transition + not
+ destek bağlantısı + atama + occurrence_recorded) occurredAt
artan sırada birleşik timeline olarak döner. UI `action`
discriminator'ı ile render eder.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string) zorunlu.

**Response 200 (`ErrorEventAuditLogResponse`):**

```json
{
  "fingerprint": "deadbeef01234567",
  "items": [
    {
      "action": "occurrence_recorded",
      "actorId": "system",
      "actorType": "system",
      "occurredAt": "2026-07-31T16:00:00.000Z",
      "data": { "occurrenceCount": 1 }
    },
    {
      "action": "transition",
      "actorId": "sa-001",
      "actorType": "user",
      "occurredAt": "2026-07-31T16:05:00.000Z",
      "data": {
        "fromStatus": "new",
        "toStatus": "investigating",
        "reason": "Sahipsiz hata; üzerime alıyorum"
      }
    },
    {
      "action": "note_added",
      "actorId": "sa-001",
      "actorType": "user",
      "occurredAt": "2026-07-31T16:30:00.000Z",
      "data": {
        "noteId": "note-0000000001",
        "body": "Provider tarafında rate limit düşürüldü."
      }
    },
    {
      "action": "support_link_added",
      "actorId": "sa-001",
      "actorType": "user",
      "occurredAt": "2026-07-31T16:35:00.000Z",
      "data": {
        "linkId": "slink-0000000001",
        "system": "jira",
        "externalId": "VET-1234"
      }
    },
    {
      "action": "assignment_change",
      "actorId": "sa-001",
      "actorType": "user",
      "occurredAt": "2026-07-31T16:40:00.000Z",
      "data": {
        "assignmentId": "asgn-0000000001",
        "assigneeId": "sa-002",
        "action": "assigned"
      }
    }
  ],
  "total": 5
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
