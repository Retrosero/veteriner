# GET /api/v1/superadmin/log-retention/policies

Tüm tenant override + global policy'leri filtreli olarak
listeler. tenantId/logType/severity filtreleri; sayfalama
zorunlu.

- **Modül:** log-retention
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Query parametreleri:**

- `tenantId` (uuid | "null" | omit) opsiyonel.
- `logType` (enum) opsiyonel.
- `severity` (enum) opsiyonel.
- `limit` (1-200, default 50).
- `offset` (0-10000, default 0).

**Response 200 (`RetentionPolicyListResponse`):**

```json
{
  "items": [
    {
      "id": "rp-0000000001",
      "tenantId": null,
      "logType": "error_event",
      "severity": "critical",
      "retentionDays": 365,
      "archiveAfterDays": 90,
      "archiveStorage": "hot",
      "redactPii": true,
      "createdById": "sa-001",
      "createdAt": "2026-07-31T16:00:00.000Z",
      "updatedById": "sa-001",
      "updatedAt": "2026-07-31T16:00:00.000Z"
    }
  ],
  "total": 12
}
```

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
