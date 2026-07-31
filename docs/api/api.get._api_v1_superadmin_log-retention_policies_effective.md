# GET /api/v1/superadmin/log-retention/policies/effective

Tenant + logType + severity kombinasyonu için geçerli policy'yi
`tenantOverride → globalOverride → default` sırasıyla döner.
`source` alanı kaynağı belirtir.

- **Modül:** log-retention
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Query parametreleri:**

- `tenantId` (uuid) opsiyonel; verilmezse global.
- `logType` (enum: audit_log | error_event | security_event |
  job_run | notification | request_log) zorunlu.
- `severity` (enum: info | warning | error | critical) zorunlu.

**Response 200 (`EffectivePolicy`):**

```json
{
  "tenantId": "tenant-uuid",
  "logType": "error_event",
  "severity": "critical",
  "retentionDays": 365,
  "archiveAfterDays": 90,
  "archiveStorage": "hot",
  "redactPii": true,
  "source": "tenantOverride"
}
```

`source` değerleri: `tenantOverride` | `globalOverride` | `default`.

**Hata kodları:**

- 400 `VET-VALIDATION-0002` — logType veya severity zorunlu.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
