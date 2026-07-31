# GET /api/v1/superadmin/error-events/groups/{fingerprint}

Belirli bir fingerprint için grup detayı. `groups`
listeleme endpoint'inin tek satır versiyonu.

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `fingerprint` (16 hex) zorunlu.

**Response 200 (`ErrorEventGroup`):**

`groups` listeleme response'undaki tek bir `items[]` elemanı
ile aynı şema.

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Fingerprint için hata olayı bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
