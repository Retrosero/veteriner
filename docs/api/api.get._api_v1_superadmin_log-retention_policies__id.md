# GET /api/v1/superadmin/log-retention/policies/{id}

ID üzerinden tekil policy erişimi.

- **Modül:** log-retention
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string, ör. `rp-0000000001`) zorunlu.

**Response 200 (`RetentionPolicy`):**

```json
{
  "id": "rp-0000000001",
  "tenantId": "tenant-uuid",
  "logType": "error_event",
  "severity": "critical",
  "retentionDays": 365,
  "archiveAfterDays": 90,
  "archiveStorage": "hot",
  "redactPii": true,
  "createdById": "sa-001",
  "createdAt": "2026-07-31T16:00:00.000Z",
  "updatedById": "sa-002",
  "updatedAt": "2026-08-01T09:00:00.000Z"
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Policy bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
