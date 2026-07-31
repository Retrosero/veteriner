# POST /api/v1/system/error-events

Frontend (tarayıcı) tarafından gönderilen hata raporlarını
kabul eder. SUPERADMIN paneline değil, oturum açmış tüm
kullanıcılara (personel + portal) açıktır. Bu nedenle
`/api/v1/system/` namespace'i altında tutulur.

- **Modül:** error-events
- **Yetki:** Oturum açmış kullanıcı (auth placeholder).
- **Audit:** `audit:error_event.client_report` (info).

İstemciden gelen `tenantId` / `branchId` / `userId` /
`actorType` / `requestId` bilgilerine GÜVENİLMEZ; bunlar
aktör bağlamından türetilir. İstemci yalnızca `severity`,
`message`, `stack` (opsiyonel), `context` (PII mask'lı),
`route`, `occurredAt` (opsiyonel), `release` (opsiyonel),
`errorCode` (opsiyonel) ve `country` (opsiyonel) alanlarını
gönderir.

**Headers (opsiyonel):**

- `X-Request-Id`: upstream korelasyon ID. Gelmezse
  `actor.correlationId`'den türetilir.

**Body (`ClientErrorReportInput`):**

```json
{
  "severity": "error",
  "message": "Failed to load examinations list",
  "stack": "Error: ...",
  "context": {
    "page": "/tr-TR/dashboard",
    "component": "AppointmentsWidget"
  },
  "route": "/[locale]/dashboard",
  "errorCode": "VET-CLIENT-0001",
  "occurredAt": "2026-07-31T16:00:00.000Z",
  "release": "0.0.0-dev",
  "country": "TR"
}
```

- `severity` (enum) zorunlu.
- `message` (string, 1-2000) zorunlu.
- `stack` (string, max 20000) opsiyonel.
- `context` (record<string, unknown>) opsiyonel.
- `route` (string, 1-512) zorunlu.
- `errorCode` opsiyonel; gelmezse `VET-CLIENT-0001` atanır.
- `occurredAt` opsiyonel; ISO datetime.
- `release` opsiyonel; string.
- `country` opsiyonel; `TR|GB|SYSTEM`.

**Response 201 (`ClientErrorReportResponse`):**

```json
{
  "id": "err-0000000042",
  "fingerprint": "abc123def4567890"
}
```

**Hata kodları:**

- 400 `VET-VALIDATION-0001` — Geçersiz payload.
