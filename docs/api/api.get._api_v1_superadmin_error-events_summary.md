# GET /api/v1/superadmin/error-events/summary

SUPERADMIN hata merkezi özet ekranı. Severity × module ×
errorCode bucket'ları + toplam sayılar + top-20 fingerprint.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Query parametreleri:**

- `from` (ISO datetime) opsiyonel.
- `to` (ISO datetime) opsiyonel.
- `module` (enum) opsiyonel.
- `country` (TR|GB|SYSTEM) opsiyonel.

**Response 200 (`ErrorEventSummary`):**

```json
{
  "total": 423,
  "bySeverity": [
    { "severity": "info", "count": 0 },
    { "severity": "warning", "count": 12 },
    { "severity": "error", "count": 380 },
    { "severity": "critical", "count": 31 }
  ],
  "byModule": [
    { "module": "auth", "count": 220 },
    { "module": "payment", "count": 95 },
    { "module": "inventory", "count": 60 },
    { "module": "lab", "count": 48 }
  ],
  "topBuckets": [
    {
      "severity": "error",
      "module": "auth",
      "errorCode": "VET-AUTH-0001",
      "fingerprint": "a1b2c3d4e5f60718",
      "eventCount": 220,
      "uniqueTenants": 5,
      "firstSeenAt": "2026-07-30T10:00:00.000Z",
      "lastSeenAt": "2026-07-31T16:00:00.000Z"
    }
  ],
  "windowFrom": "2026-07-30T00:00:00.000Z",
  "windowTo": "2026-07-31T23:59:59.000Z"
}
```

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
