# GET /api/v1/superadmin/error-events

SUPERADMIN hata merkezi için filtreli hata olayı araması.
Tüm tenant'ların hata olaylarını döner; tenant filtresi
opsiyonel.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez (sadece görüntüleme).

**Query parametreleri:**

- `severity` (enum: info|warning|error|critical) opsiyonel.
- `module` (enum) opsiyonel.
- `errorCode` (VET-XXXX-NNNN) opsiyonel.
- `fingerprint` (16 hex) opsiyonel.
- `tenantId` (uuid) opsiyonel.
- `branchId` (uuid) opsiyonel.
- `country` (TR|GB|SYSTEM) opsiyonel.
- `release` (string) opsiyonel.
- `route` (string) opsiyonel.
- `status` (enum: new|investigating|resolved|reopened) opsiyonel.
- `assignedToUserId` (string) opsiyonel.
- `from` (ISO datetime) opsiyonel.
- `to` (ISO datetime) opsiyonel.
- `search` (string, max 200) opsiyonel.
- `sort` (asc|desc) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`ErrorEventListResponse`):**

```json
{
  "items": [
    {
      "id": "err-0000000001",
      "requestId": "req-uuid",
      "tenantId": "tenant-uuid",
      "branchId": "branch-uuid",
      "userId": "user-123",
      "actorType": "user",
      "module": "auth",
      "route": "POST /api/v1/auth/login",
      "release": "0.0.0-dev",
      "severity": "error",
      "fingerprint": "a1b2c3d4e5f60718",
      "errorCode": "VET-AUTH-0001",
      "message": "Kimlik doğrulama başarısız",
      "statusCode": 401,
      "stack": null,
      "context": {},
      "country": "TR",
      "occurredAt": "2026-07-31T16:00:00.000Z",
      "firstSeenAt": "2026-07-31T16:00:00.000Z",
      "lastSeenAt": "2026-07-31T16:30:00.000Z",
      "occurrenceCount": 12,
      "status": "new",
      "assignedToUserId": null
    }
  ],
  "total": 87
}
```

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz (SUPERADMIN değil).
