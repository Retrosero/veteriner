# GET /api/v1/superadmin/job-runs/summary

SUPERADMIN job run özeti. Status × queue aggregate. Son
24 saatteki dead-letter sayısı + en eski running/pending
zamanı operatör kararını kolaylaştırır.

- **Modül:** job-runs
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Query parametreleri:**

- `from` (ISO datetime) opsiyonel.
- `to` (ISO datetime) opsiyonel.
- `tenantId` (uuid) opsiyonel.

**Response 200 (`JobRunSummary`):**

```json
{
  "total": 1240,
  "byStatus": [
    { "status": "pending", "count": 5 },
    { "status": "running", "count": 12 },
    { "status": "succeeded", "count": 1150 },
    { "status": "failed", "count": 60 },
    { "status": "dead_letter", "count": 13 }
  ],
  "byQueue": [
    {
      "queueName": "reminders",
      "succeeded": 800,
      "failed": 30,
      "dead_letter": 5,
      "running": 4,
      "pending": 2
    },
    {
      "queueName": "esmm",
      "succeeded": 250,
      "failed": 20,
      "dead_letter": 7,
      "running": 3,
      "pending": 0
    }
  ],
  "deadLetterLast24h": 12,
  "oldestRunningStartedAt": "2026-07-31T15:42:00.000Z",
  "oldestPendingStartedAt": "2026-07-31T15:50:00.000Z",
  "windowFrom": "2026-07-30T00:00:00.000Z",
  "windowTo": "2026-07-31T23:59:59.000Z"
}
```

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
