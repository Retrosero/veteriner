# GET /api/v1/superadmin/job-runs/attempts/{jobKey}

Belirli bir `jobKey` için tüm retry geçmişini (en eski
önce) döner. `allFailed` ve `lastStatus` özet alanları
operatör kararını kolaylaştırır.

- **Modül:** job-runs
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `jobKey` (string) zorunlu.

**Response 200 (`JobRunAttemptsByKeyResponse`):**

```json
{
  "jobKey": "reminder:vaccine:patient-uuid:2026-08-01",
  "items": [
    {
      "id": "jr-0000000001",
      "attempt": 1,
      "status": "failed",
      "startedAt": "2026-07-31T15:00:00.000Z",
      "finishedAt": "2026-07-31T15:00:05.000Z",
      "errorCode": "VET-INTEGRATION-0004",
      "parentRunId": null
    },
    {
      "id": "jr-0000000002",
      "attempt": 2,
      "status": "failed",
      "startedAt": "2026-07-31T15:30:00.000Z",
      "finishedAt": "2026-07-31T15:30:05.000Z",
      "errorCode": "VET-INTEGRATION-0004",
      "parentRunId": "jr-0000000001"
    },
    {
      "id": "jr-0000000003",
      "attempt": 3,
      "status": "dead_letter",
      "startedAt": "2026-07-31T16:00:00.000Z",
      "finishedAt": "2026-07-31T16:00:05.000Z",
      "errorCode": "VET-INTEGRATION-0004",
      "parentRunId": "jr-0000000002"
    }
  ],
  "total": 3,
  "allFailed": true,
  "lastStatus": "dead_letter"
}
```

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
