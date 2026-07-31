# POST /api/v1/superadmin/job-runs

Yeni bir job run başlatır (BullMQ/queue veya adapter
çağrısı). Default `attempt=1`, `status='running'`.

- **Modül:** job-runs
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:job_run.started` (info).

**Body (`JobRunStartInput`):**

```json
{
  "queueName": "reminders",
  "jobName": "send-vaccine-reminder",
  "jobKey": "reminder:vaccine:patient-uuid:2026-08-01",
  "source": "queue",
  "tenantId": "tenant-uuid",
  "branchId": "branch-uuid",
  "country": "TR",
  "triggeredBy": "system",
  "maxAttempts": 3,
  "input": {
    "patientId": "patient-uuid",
    "vaccineId": "vaccine-uuid"
  },
  "release": "0.0.0-dev"
}
```

- `queueName` (string, max 100) zorunlu.
- `jobName` (string, max 100) zorunlu.
- `jobKey` (string, max 200) zorunlu; retry zincirinde aynı
  anahtar kullanılır.
- `source` (enum: queue|adapter|cron|system) zorunlu.
- `tenantId` (uuid) opsiyonel.
- `branchId` (uuid) opsiyonel.
- `country` (TR|GB|SYSTEM) opsiyonel.
- `triggeredBy` (enum: user|system|manual_retry|integration) zorunlu.
- `maxAttempts` (int, 1-10, default 3) opsiyonel.
- `input` (record<string, unknown>) opsiyonel; PII mask'lı saklanır.
- `release` (string, max 64) opsiyonel.

**Response 201 (`JobRun`):**

```json
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
```

**Hata kodları:**

- 400 `VET-VALIDATION-0001` — Geçersiz payload.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
