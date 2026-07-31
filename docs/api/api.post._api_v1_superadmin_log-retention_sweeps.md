# POST /api/v1/superadmin/log-retention/sweeps

Manuel retention sweep başlatır. Tüm bilinen tenant'lar ×
logType × severity kombinasyonları için effective policy
çözer; cutoff'lar hesaplar; target repository'ler üzerinden
arşiv/sil yapar. `dryRun=true` ise gerçek işlem yapılmaz,
yalnız sayım döner.

- **Modül:** log-retention
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:log_retention.sweep_trigger` (info|warning).

**Body (`TriggerRetentionSweep`):**

```json
{
  "dryRun": false,
  "logTypes": ["error_event", "security_event"],
  "tenantId": "tenant-uuid"
}
```

- `dryRun` (bool) opsiyonel; default `false`.
- `logTypes` (enum[]) opsiyonel; verilmezse tüm logType'lar.
- `tenantId` (uuid) opsiyonel; verilmezse global sweep.

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
    }
  ],
  "totals": {
    "expired": 1240,
    "archived": 1100,
    "deleted": 140
  }
}
```

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
