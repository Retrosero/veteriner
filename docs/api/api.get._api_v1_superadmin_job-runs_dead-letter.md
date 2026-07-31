# GET /api/v1/superadmin/job-runs/dead-letter

Yalnızca `status = dead_letter` olan run'ları listeler.
tenant/queue/jobName/from/to filtreleri ile daraltılabilir.

- **Modül:** job-runs
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Query parametreleri:**

- `tenantId` (uuid) opsiyonel.
- `queueName` (string) opsiyonel.
- `jobName` (string) opsiyonel.
- `from` (ISO datetime) opsiyonel.
- `to` (ISO datetime) opsiyonel.
- `limit` (1-200, default 50).
- `offset` (0-10000, default 0).

**Response 200 (`JobRunListResponse`):**

`JobRunListResponse` ile aynı şema; sadece `status =
dead_letter` kayıtları döner.

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
