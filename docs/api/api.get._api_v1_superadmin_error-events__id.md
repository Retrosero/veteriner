# GET /api/v1/superadmin/error-events/{id}

Tek bir hata olayının detayı. Stack trace yalnızca 5xx +
critical için dolu; 4xx'te `null`.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string, ör. `err-0000000001`) zorunlu.

**Response 200 (`ErrorEvent`):**

```json
{
  "id": "err-0000000001",
  "requestId": "req-uuid",
  "tenantId": "tenant-uuid",
  "branchId": "branch-uuid",
  "userId": "user-123",
  "actorType": "user",
  "module": "payment",
  "route": "POST /api/v1/payments",
  "release": "0.0.0-dev",
  "severity": "critical",
  "fingerprint": "deadbeef01234567",
  "errorCode": "VET-PAYMENT-0005",
  "message": "Ödeme sağlayıcısı zaman aşımı",
  "statusCode": 504,
  "stack": "Error: timeout\n  at ...",
  "context": {
    "amount": "120.00",
    "provider": "iyzico",
    "requestId": "req-uuid"
  },
  "country": "TR",
  "occurredAt": "2026-07-31T16:00:00.000Z",
  "firstSeenAt": "2026-07-31T16:00:00.000Z",
  "lastSeenAt": "2026-07-31T16:00:00.000Z",
  "occurrenceCount": 1,
  "status": "new",
  "assignedToUserId": null
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
