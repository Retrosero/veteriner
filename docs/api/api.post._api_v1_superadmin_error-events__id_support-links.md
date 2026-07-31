# POST /api/v1/superadmin/error-events/{id}/support-links

Hata olayına yeni bir destek kaydı bağlantısı ekler. Sistem,
externalId, url veya title alanlarından en az biri zorunludur.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** `audit:error_event.support_link_added` (info).

**Path parametreleri:**

- `id` (string) zorunlu.

**Body (`ErrorEventSupportLinkInput`):**

```json
{
  "system": "jira",
  "externalId": "VET-1234",
  "url": "https://vetniva.atlassian.net/browse/VET-1234",
  "title": "iyzico timeout spike"
}
```

- `system` (enum: jira|linear|zendesk|github|other) opsiyonel.
- `externalId` (string, max 64) opsiyonel.
- `url` (string, max 2048, URL) opsiyonel.
- `title` (string, max 200) opsiyonel.

**Response 201 (`ErrorEventSupportLink`):**

```json
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
```

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Hata olayı bulunamadı.
- 422 `VET-VALIDATION-0001` — Geçersiz bağlantı (en az bir alan zorunlu).
- 403 `VET-AUTHZ-0001` — Yetkisiz.
