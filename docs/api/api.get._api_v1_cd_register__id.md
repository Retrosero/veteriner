# GET /api/v1/cd/register/:id

Tek bir controlled-drug register kaydını getirir.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:prescription:read`
- **Tenant izolasyonu:** başka tenant kaydı 404 olarak döner; varlığı sızmaz.

Yanıt append-only kaydın hareket, tanık, transfer ve sayım alanlarını içerir.

**Hatalar:** `VET-CD-0006`, `VET-AUTHZ-0001`, `VET-TENANT-0001`.
