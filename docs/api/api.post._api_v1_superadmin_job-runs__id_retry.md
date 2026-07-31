# POST /api/v1/superadmin/job-runs/{id}/retry

Yalnızca `failed` veya `dead_letter` durumdaki run'lardan
yeni deneme başlatır. Yeni run `parentRunId` ile eski run'a
bağlanır.

- **Modül:** job-runs
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:job_run.retried` (info).

**Path parametreleri:**

- `id` (string) zorunlu.

**Body (`JobRunRetryInput`):** opsiyonel.

```json
{
  "input": { "channel": "email" },
  "maxAttempts": 5
}
```

- `input` opsiyonel; orijinal input yerine bu kullanılır.
- `maxAttempts` (1-10) opsiyonel; default eski değer.

**Response 201 (`JobRun`):**

Yeni run kaydı; `attempt = parent.attempt + 1`,
`parentRunId = parent.id`, `status = 'running'`.

**Hata kodları:**

- 404 `VET-AUDIT-0002` — Run bulunamadı.
- 409 `VET-JOBRUN-0003` — Run retry için uygun değil
  (succeeded/running/pending).
- 403 `VET-AUTHZ-0001` — Yetkisiz.
