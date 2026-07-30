# GET /api/v1/tenants/:tenantId/branches

Tenant'ın şubelerini listeler. RLS actor.tenantId üzerinden filtreyi
uygular; actor SUPERADMIN değilse yalnızca kendi tenant'ının
branch'lerini görür.

Detaylı sözleşme için: [`API_CATALOG.md`](./API_CATALOG.md#get-apiv1tenantstenantidbranches).

- **Yetki:** `branch:branch:read`
- **Sorgu:** `status` (opsiyonel)
- **RLS:** `app.tenant_id` set edilir
