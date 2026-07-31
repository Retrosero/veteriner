# GET /api/v1/superadmin/security-events/summary

SUPERADMIN güvenlik olayı özet ekranı. Severity × type
kırılımı + toplam sayılar + top-20 fingerprint saldırı
sınıfı kartları.

- **Modül:** security-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Query parametreleri:**

- `from` (ISO datetime) opsiyonel.
- `to` (ISO datetime) opsiyonel.
- `type` (enum) opsiyonel.
- `module` (enum) opsiyonel.
- `country` (TR|GB|SYSTEM) opsiyonel.

**Response 200 (`SecurityEventSummary`):**

```json
{
  "total": 87,
  "bySeverity": [
    { "severity": "info", "count": 12 },
    { "severity": "warning", "count": 60 },
    { "severity": "error", "count": 10 },
    { "severity": "critical", "count": 5 }
  ],
  "byType": [
    { "type": "failed_login", "count": 45 },
    { "type": "suspicious_export", "count": 12 },
    { "type": "unauthorized_access_attempt", "count": 20 },
    { "type": "role_change", "count": 5 },
    { "type": "tenant_isolation_breach_attempt", "count": 5 }
  ],
  "topGroups": [
    {
      "fingerprint": "abc123def4567890",
      "type": "tenant_isolation_breach_attempt",
      "severity": "critical",
      "module": "tenant",
      "message": "Cross-tenant access attempt",
      "eventCount": 5,
      "uniqueTenants": 2,
      "uniqueUsers": 3,
      "firstSeenAt": "2026-07-30T10:00:00.000Z",
      "lastSeenAt": "2026-07-31T16:00:00.000Z",
      "alertSent": true
    }
  ],
  "windowFrom": "2026-07-30T00:00:00.000Z",
  "windowTo": "2026-07-31T23:59:59.000Z"
}
```

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
