# GET /api/v1/superadmin/log-retention/sweeps

Geçmiş sweep kayıtlarını filtreli olarak listeler.
triggeredBy/from/to filtreleri; sayfalama zorunlu.

- **Modül:** log-retention
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Query parametreleri:**

- `triggeredBy` (string) opsiyonel.
- `from` (ISO datetime) opsiyonel.
- `to` (ISO datetime) opsiyonel.
- `limit` (1-200, default 50).
- `offset` (0-10000, default 0).

**Response 200 (`RetentionSweepHistoryResponse`):**

```json
{
  "items": [
    {
      "id": "sw-0000000001",
      "triggeredBy": "sa-001",
      "triggeredByType": "user",
      "startedAt": "2026-07-31T16:00:00.000Z",
      "finishedAt": "2026-07-31T16:00:30.000Z",
      "durationMs": 30000,
      "dryRun": false
    }
  ],
  "total": 87
}
```

**Hata kodları:**

- 403 `VET-AUTHZ-0001` — Yetkisiz.
