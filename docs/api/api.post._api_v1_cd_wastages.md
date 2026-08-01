# POST /api/v1/cd/wastages

Bozuk, süresi geçmiş veya geri çağrılmış kontrollü ilacı imha (`wasted`)
hareketi olarak kaydeder.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:prescription:create`
- **Audit:** `audit:cd.wasted` (warning)

S2 ve S3 schedule ilaçlarda tanık kullanıcı zorunludur; tanık, işlemi yapan
kullanıcı olamaz. Kayıt stoktan negatif düşer ve append-only'dir.

**Hatalar:** `VET-CD-0002`, `VET-CD-0003`, `VET-VALIDATION-0001`.
