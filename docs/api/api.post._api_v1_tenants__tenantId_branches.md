# POST /api/v1/tenants/:tenantId/branches

Yeni şube oluşturur. SUPERADMIN veya tenant OWNER.

Detaylı sözleşme için: [`API_CATALOG.md`](./API_CATALOG.md#post-apiv1tenantstenantidbranches).

- **Yetki:** `branch:branch:create`
- **Audit:** `audit:branch.create`
- **Hata kodları:** `VET-AUTHZ-0001`, `VET-BRANCH-0003` (code çakışma)
