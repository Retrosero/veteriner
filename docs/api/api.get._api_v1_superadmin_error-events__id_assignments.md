# GET /api/v1/superadmin/error-events/{id}/assignments

Bir hata olayının tüm atama kayıtlarını assignedAt artan
sırada döner. Append-only; her atama/unassign yeni kayıt
oluşturur.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string) zorunlu.

**Response 200 (`ErrorEventAssignmentListResponse`):**

```json
{
  "items": [
    {
      "id": "asgn-0000000001",
      "fingerprint": "deadbeef01234567",
      "assigneeId": "sa-002",
      "assignorId": "sa-001",
      "action": "assigned",
      "assignedAt": "2026-07-31T16:40:00.000Z"
    },
    {
      "id": "asgn-0000000002",
      "fingerprint": "deadbeef01234567",
      "assigneeId": null,
      "assignorId": "sa-002",
      "action": "unassigned",
      "assignedAt": "2026-07-31T17:00:00.000Z"
    }
  ],
  "total": 2
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
