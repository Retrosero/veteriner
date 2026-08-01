# POST /api/v1/cd/transfers

Kontrollü ilacı şube veya saklama alanları arasında transfer eder.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:prescription:create`
- **Audit:** `audit:cd.transferred` (info)

Tek çağrı, aynı `transferGroupId` ile bağlı kaynak negatif ve hedef pozitif iki
append-only kayıt üretir. Kaynak ve hedef aynı olamaz.

**Hatalar:** `VET-CD-0004`, `VET-VALIDATION-0001`, `VET-AUTHZ-0001`.
