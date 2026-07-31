# GET /api/v1/superadmin/security-events/{id}

Tek güvenlik olayı detayı. IP `192.168.1.***` formatında
mask'lı; context PII mask'lı; userAgent 8 hex hash.

- **Modül:** security-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string, ör. `sec-0000000001`) zorunlu.

**Response 200 (`SecurityEvent`):**

```json
{
  "id": "sec-0000000001",
  "requestId": "req-uuid",
  "tenantId": "tenant-uuid",
  "branchId": "branch-uuid",
  "userId": "user-123",
  "actorType": "user",
  "type": "failed_login",
  "module": "auth",
  "route": "POST /api/v1/auth/login",
  "release": "0.0.0-dev",
  "severity": "warning",
  "fingerprint": "abc123def4567890",
  "errorCode": "VET-AUTH-0002",
  "message": "Wrong password for usr-1",
  "statusCode": 401,
  "ipAddress": "192.168.1.***",
  "userAgentHash": "01234567",
  "context": {
    "email": "u***@e******.com",
    "attempts": 3
  },
  "country": "TR",
  "occurredAt": "2026-07-31T16:00:00.000Z",
  "firstSeenAt": "2026-07-31T16:00:00.000Z",
  "lastSeenAt": "2026-07-31T16:00:00.000Z",
  "occurrenceCount": 1,
  "alertSent": false
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Güvenlik olayı bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
