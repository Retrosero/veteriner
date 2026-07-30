# GET /api/v1/tenants

Tenant listesi (sayfalı). SUPERADMIN tüm tenant'ları görür; tenant
kullanıcısı yalnızca kendi tenant'ını.

Detaylı sözleşme için: [`API_CATALOG.md`](./API_CATALOG.md#get-apiv1tenants).

- **Yetki:** `tenant:tenant:read`
- **Sorgu:** `page`, `pageSize`, `status`, `country`, `search`
