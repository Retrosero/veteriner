# PATCH /api/v1/superadmin/error-events/{id}/assignment

Hata olayını geliştirici/sorumluya atar veya mevcut atamayı
kaldırır. Status değiştirmez; salt atama aksiyonu izlenir.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:error_event.assignment_change` (info).

**Path parametreleri:**

- `id` (string) zorunlu.

**Body (`ErrorEventAssignmentInput`):**

```json
{
  "assigneeId": "sa-002",
  "unassign": false
}
```

- `assigneeId` (string) opsiyonel (atama için).
- `unassign` (bool) opsiyonel (atama kaldırma için).
  En az biri zorunludur.

**Response 200 (`ErrorEventAssignmentResponse`):**

```json
{
  "event": {
    "id": "err-0000000001",
    "assignedToUserId": "sa-002",
    "status": "investigating"
  },
  "assignment": {
    "id": "asgn-0000000001",
    "fingerprint": "deadbeef01234567",
    "assigneeId": "sa-002",
    "assignorId": "sa-001",
    "action": "assigned",
    "assignedAt": "2026-07-31T16:40:00.000Z"
  }
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 422 `VET-VALIDATION-0001` — Geçersiz atama (`assigneeId`
  ve `unassign` aynı anda boş/geçersiz).
- 403 `VET-AUTHZ-0001` — Yetkisiz.
