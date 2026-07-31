# GET /api/v1/superadmin/error-events/fingerprints/{fingerprint}

Belirli bir fingerprint için toplu kayıt (occurrenceCount +
firstSeenAt + lastSeenAt).

- **Modül:** error-events
- **Yetki:** `audit:log:read` (SUPERADMIN)
- **Audit:** okuma audit üretmez.

**Path parametreleri:**

- `fingerprint` (16 hex) zorunlu.

**Response 200 (`ErrorEvent`):**

`errorEventSchema` ile aynı şema. Birden fazla tekrar
görülen hata tek bir kayıtta toplanır; `occurrenceCount`
toplam tekrar sayısını, `firstSeenAt`/`lastSeenAt` ise ilk
ve son görülme zamanlarını taşır.

**Hata kodları:**

- 404 `VET-AUDIT-0001` — Fingerprint için hata olayı bulunamadı.
- 403 `VET-AUTHZ-0001` — Yetkisiz.
