# DELETE /api/v1/superadmin/log-retention/policies/{id}

ID üzerinden policy siler. Effective policy etkisi hemen
uygulanır; sweep bir sonraki çalıştırmada yeni değerleri
kullanır.

- **Modül:** log-retention
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:log_retention.policy_delete` (warning).

**Path parametreleri:**

- `id` (string) zorunlu.

**Response 200:**

```json
{
  "id": "rp-0000000001",
  "deleted": true
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Policy bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
