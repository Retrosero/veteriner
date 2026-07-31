# GET /api/v1/superadmin/job-runs

SUPERADMIN job run araması. Tüm tenant'ların job run'larını
filtreli listeler.

- **Modül:** job-runs
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Query parametreleri:**

- `queueName` (string) opsiyonel.
- `jobName` (string) opsiyonel.
- `jobKey` (string) opsiyonel.
- `status` (enum: pending|running|succeeded|failed|dead_letter) opsiyonel.
- `source` (enum: queue|adapter|cron|system) opsiyonel.
- `triggeredBy` (enum: user|system|manual_retry|integration) opsiyonel.
- `tenantId` (uuid) opsiyonel.
- `branchId` (uuid) opsiyonel.
- `country` (TR|GB|SYSTEM) opsiyonel.
- `from` (ISO datetime) opsiyonel.
- `to` (ISO datetime) opsiyonel.
- `search` (string, max 200) opsiyonel.
- `sort` (asc|desc) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`JobRunListResponse`):**

```json
{
  "items": [
    {
      "id": "jr-0000000001",
      "queueName": "reminders",
      "jobName": "send-vaccine-reminder",
      "jobKey": "reminder:vaccine:patient-uuid:2026-08-01",
      "attempt": 1,
      "maxAttempts": 3,
      "status": "running",
      "source": "queue",
      "triggeredBy": "system",
      "tenantId": "tenant-uuid",
      "branchId": "branch-uuid",
      "country": "TR",
      "startedAt": "2026-07-31T16:00:00.000Z",
      "finishedAt": null,
      "durationMs": null,
      "parentRunId": null,
      "errorCode": null,
      "errorStack": null,
      "input": {},
      "output": null,
      "release": "0.0.0-dev"
    }
  ],
  "total": 412
}
```

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
