# GET /api/v1/superadmin/log-retention/sweeps/{id}

Tek sweep kaydı detayı (bucket bazlı sayımlar dahil).

- **Modül:** log-retention
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string, ör. `sw-0000000001`) zorunlu.

**Response 200 (`RetentionSweepResult`):**

```json
{
  "id": "sw-0000000001",
  "triggeredBy": "sa-001",
  "triggeredByType": "user",
  "startedAt": "2026-07-31T16:00:00.000Z",
  "finishedAt": "2026-07-31T16:00:30.000Z",
  "durationMs": 30000,
  "dryRun": false,
  "buckets": [
    {
      "tenantId": "tenant-uuid",
      "logType": "error_event",
      "severity": "critical",
      "cutoff": "2025-07-31T16:00:00.000Z",
      "expired": 12,
      "archived": 12,
      "deleted": 0
    },
    {
      "tenantId": "tenant-uuid",
      "logType": "security_event",
      "severity": "critical",
      "cutoff": "2019-07-31T16:00:00.000Z",
      "expired": 3,
      "archived": 3,
      "deleted": 0
    }
  ],
  "totals": {
    "expired": 15,
    "archived": 15,
    "deleted": 0
  }
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Sweep bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
