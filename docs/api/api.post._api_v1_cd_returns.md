# POST /api/v1/cd/returns

Hasta sahibine iade edilen kontrollü ilacı `returned` hareketi olarak ekler.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:prescription:create`
- **Audit:** `audit:cd.returned` (info)

`ownerId`, iade gerekçesi, ilaç/schedule/birim/miktar ve saklama konumu
zorunludur. Hareket stok bakiyesine pozitif etki eder; kayıt append-only'dir.

**Hatalar:** `VET-VALIDATION-0001`, `VET-AUTHZ-0001`, `VET-TENANT-0001`.
