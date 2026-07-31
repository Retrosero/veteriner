# PUT /api/v1/superadmin/log-retention/policies

(tenantId, logType, severity) anahtarıyla policy oluşturur
veya günceller. tenantId=null → global override. `redactPii`
servis tarafından her zaman `true` yapılır; caller override
edemez (KVKK/UK GDPR uyumu).

- **Modül:** log-retention
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:log_retention.policy_upsert` (info|warning).

**Body (`RetentionPolicyUpsert`):**

```json
{
  "tenantId": "tenant-uuid",
  "logType": "error_event",
  "severity": "critical",
  "retentionDays": 365,
  "archiveAfterDays": 90,
  "archiveStorage": "hot"
}
```

- `tenantId` (uuid | null) zorunlu. `null` = global override.
- `logType` zorunlu.
- `severity` zorunlu.
- `retentionDays` (1-3650) zorunlu.
- `archiveAfterDays` (0-retentionDays) zorunlu.
- `archiveStorage` (hot | cold | none) zorunlu.

**Response 200 (`RetentionPolicy`):**

`RetentionPolicy` şeması ile aynı; `redactPii=true` her zaman.

**Hata kodları:**

- 400 `VET-VALIDATION-0001` — Geçersiz payload
  (örn. archiveAfterDays > retentionDays).
- 403 `VET-AUTHZ-0001` — Yetkisiz.
