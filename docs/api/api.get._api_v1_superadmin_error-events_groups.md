# GET /api/v1/superadmin/error-events/groups

Fingerprint bazlı tek satır özet (gruplanmış hata listesi).
SUPERADMIN hata merkezi özet ekranı için tasarlandı.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Query parametreleri:**

- `severity`, `module`, `errorCode`, `status`,
  `assignedToUserId`, `tenantId`, `branchId`, `country`,
  `release`, `from`, `to`, `search` (string) — tümü opsiyonel.
- `limit` (1-200, default 50).
- `offset` (0-10000, default 0).

**Response 200 (`ErrorEventGroupListResponse`):**

```json
{
  "items": [
    {
      "fingerprint": "a1b2c3d4e5f60718",
      "severity": "error",
      "module": "auth",
      "errorCode": "VET-AUTH-0001",
      "message": "Kimlik doğrulama başarısız",
      "route": "POST /api/v1/auth/login",
      "release": "0.0.0-dev",
      "country": "TR",
      "tenantCount": 5,
      "branchCount": 8,
      "eventCount": 220,
      "firstSeenAt": "2026-07-30T10:00:00.000Z",
      "lastSeenAt": "2026-07-31T16:00:00.000Z",
      "status": "investigating",
      "assignedToUserId": "sa-001"
    }
  ],
  "total": 47
}
```

Sıralama: `eventCount` DESC.

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
