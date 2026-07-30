# POST /api/v1/tenants

Yeni tenant oluşturur. Yalnızca SUPERADMIN.

Detaylı sözleşme için: [`API_CATALOG.md`](./API_CATALOG.md#post-apiv1tenants).

- **Yetki:** `tenant:tenant:create` (SUPERADMIN)
- **Audit:** `audit:tenant.create`
- **Hata kodları:** `VET-AUTHZ-0005`, `VET-TENANT-0004`, `VET-VALIDATION-0003`
- **Idempotency:** Önerilir (`Idempotency-Key` header)
