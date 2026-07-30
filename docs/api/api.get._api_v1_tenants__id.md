# GET /api/v1/tenants/:id

Tenant detayı. Cross-tenant denemesi 404 döner (bilgi sızdırmaz).

Detaylı sözleşme için: [`API_CATALOG.md`](./API_CATALOG.md#get-apiv1tenantsid).

- **Yetki:** `tenant:tenant:read`
- **Hata kodları:** `VET-TENANT-0001` (404), `VET-TENANT-0002` (403 kapalı)
