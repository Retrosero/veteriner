# POST /api/v1/superadmin/job-runs/{id}/finish

Çalışan run'ı `succeeded`/`failed`/`dead_letter` olarak
kapatır. `attempt >= maxAttempts` olan failed otomatik
dead_letter'a terfi eder.

- **Modül:** job-runs
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:job_run.finished` (info|warning|error).

**Path parametreleri:**

- `id` (string) zorunlu.

**Body (`JobRunFinishInput`):**

```json
{
  "status": "succeeded",
  "output": {
    "channel": "sms",
    "messageId": "msg-123"
  }
}
```

- `status` (enum: succeeded|failed|dead_letter) zorunlu.
- `output` opsiyonel; succeeded için önerilir.
- `errorCode` (VET-XXX-NNNN) opsiyonel; failed/dead_letter için önerilir.
- `errorMessage` opsiyonel; insan-okur hata özeti.
- `errorStack` (string, max 20000) opsiyonel; failed/dead_letter için saklanır.

**Response 200 (`JobRun`):**

```json
{
  "id": "jr-0000000001",
  "status": "succeeded",
  "finishedAt": "2026-07-31T16:00:05.000Z",
  "durationMs": 5000,
  "output": { "channel": "sms", "messageId": "msg-123" }
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0002` — Run bulunamadı.
- 409 `VET-JOBRUN-0001` — Run zaten terminal (idempotency).
- 403 `VET-AUTHZ-0001` — Yetkisiz.
