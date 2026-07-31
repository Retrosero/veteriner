# GET /api/v1/superadmin/error-events/{id}/transitions

Bir hata olayının tüm status geçişlerini append-only
log'dan tarih sırasıyla döner. Sistem kaynaklı otomatik
`resolved → reopened` terfileri de dahildir.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string) zorunlu.

**Response 200 (`ErrorEventListTransitionsResponse`):**

```json
{
  "fingerprint": "deadbeef01234567",
  "items": [
    {
      "id": "trn-0000000001",
      "fingerprint": "deadbeef01234567",
      "fromStatus": "new",
      "toStatus": "investigating",
      "actorId": "sa-001",
      "actorType": "user",
      "reason": "Sahipsiz hata; üzerime alıyorum",
      "occurredAt": "2026-07-31T16:05:00.000Z"
    },
    {
      "id": "trn-0000000002",
      "fingerprint": "deadbeef01234567",
      "fromStatus": "investigating",
      "toStatus": "resolved",
      "actorId": "sa-001",
      "actorType": "user",
      "reason": "Provider timeout sorunu kökü çözüldü",
      "occurredAt": "2026-07-31T17:30:00.000Z"
    },
    {
      "id": "trn-0000000003",
      "fingerprint": "deadbeef01234567",
      "fromStatus": "resolved",
      "toStatus": "reopened",
      "actorId": "system",
      "actorType": "system",
      "reason": "Yeni hata oluştu — otomatik reopened terfisi",
      "occurredAt": "2026-07-31T18:00:00.000Z"
    }
  ],
  "total": 3
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
