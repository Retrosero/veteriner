# PATCH /api/v1/superadmin/error-events/{id}/status

Hata olayının durumunu state machine'e uygun şekilde
günceller. Opsiyonel atama yapar veya atamayı kaldırır.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:error_event.status_change` (info).

**Path parametreleri:**

- `id` (string) zorunlu.

**Body (`ErrorEventStatusUpdateInput`):**

```json
{
  "toStatus": "investigating",
  "reason": "Sahipsiz hata; üzerime alıyorum",
  "assignedToUserId": "sa-001",
  "clearAssignment": false
}
```

- `toStatus` (enum: new|investigating|resolved|reopened) zorunlu.
- `reason` (string, max 1000) opsiyonel.
- `assignedToUserId` (string) opsiyonel.
- `clearAssignment` (bool) opsiyonel (true ise atamayı kaldırır).

**Geçerli geçişler:**

| from          | to                            |
| ------------- | ----------------------------- |
| `new`         | `investigating`, `resolved`   |
| `investigating` | `resolved`, `new`           |
| `resolved`    | `reopened`, `investigating`   |
| `reopened`    | `investigating`, `resolved`   |

**Response 200 (`ErrorEventStatusUpdateResponse`):**

```json
{
  "event": {
    "id": "err-0000000001",
    "status": "investigating",
    "assignedToUserId": "sa-001"
  },
  "transition": {
    "id": "trn-0000000001",
    "fingerprint": "deadbeef01234567",
    "fromStatus": "new",
    "toStatus": "investigating",
    "actorId": "sa-001",
    "actorType": "user",
    "reason": "Sahipsiz hata; üzerime alıyorum",
    "occurredAt": "2026-07-31T16:05:00.000Z"
  }
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 422 `VET-ERRSTAT-0001` — Geçersiz durum geçişi.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
