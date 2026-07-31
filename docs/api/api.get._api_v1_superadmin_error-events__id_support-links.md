# GET /api/v1/superadmin/error-events/{id}/support-links

Bir hata olayına bağlanan JIRA/Linear/Zendesk/GitHub destek
kayıtlarını createdAt artan sırada döner.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `id` (string) zorunlu.

**Response 200 (`ErrorEventSupportLinkListResponse`):**

```json
{
  "items": [
    {
      "id": "slink-0000000001",
      "fingerprint": "deadbeef01234567",
      "system": "jira",
      "externalId": "VET-1234",
      "url": "https://vetniva.atlassian.net/browse/VET-1234",
      "title": "iyzico timeout spike",
      "createdById": "sa-001",
      "createdByType": "user",
      "createdAt": "2026-07-31T16:35:00.000Z"
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
