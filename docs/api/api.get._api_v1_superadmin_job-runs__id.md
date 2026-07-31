# GET /api/v1/superadmin/job-runs/{id}

Tek run detayı. `input` ve `output` PII mask'lı; `errorStack`
yalnızca failed/dead_letter için dolu.

- **Modül:** job-runs
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string) zorunlu.

**Response 200 (`JobRun`):**

```json
{
  "id": "jr-0000000001",
  "queueName": "reminders",
  "jobName": "send-vaccine-reminder",
  "jobKey": "reminder:vaccine:patient-uuid:2026-08-01",
  "attempt": 1,
  "maxAttempts": 3,
  "status": "failed",
  "source": "queue",
  "triggeredBy": "system",
  "tenantId": "tenant-uuid",
  "branchId": "branch-uuid",
  "country": "TR",
  "startedAt": "2026-07-31T15:00:00.000Z",
  "finishedAt": "2026-07-31T15:00:05.000Z",
  "durationMs": 5000,
  "parentRunId": null,
  "errorCode": "VET-INTEGRATION-0004",
  "errorMessage": "SMS provider timeout",
  "errorStack": "Error: timeout\n  at ...",
  "input": {
    "patientId": "patient-uuid",
    "phone": "+90*******"
  },
  "output": null,
  "release": "0.0.0-dev"
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0002` — Run bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
