# POST /api/v1/tenants/:id/close

Tenant'ı kapatır (soft delete). Yalnızca SUPERADMIN. Fiziksel silme
yok; `status = closed` ve `archivedAt` set edilir.

Detaylı sözleşme için: [`API_CATALOG.md`](./API_CATALOG.md#post-apiv1tenantsidclose).

- **Yetki:** `tenant:tenant:archive` (SUPERADMIN)
- **Audit:** `audit:tenant.close` (severity: critical)
- **Hata kodları:** `VET-TENANT-0005` (409 zaten kapalı)
