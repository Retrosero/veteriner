# GET /api/v1/cd/register

Tenant kapsamındaki controlled-drug defterini kronolojik sırada listeler.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:prescription:read`
- **Tenant izolasyonu:** yalnız aktif actor tenantının kayıtları döner.

Opsiyonel filtreler: `drugName`, `schedule`, `entryType`, `branchId`,
`storageAreaId`, `from`, `to`, `limit` ve `offset`. Yanıt `items` ve `total`
alanlarını içerir.

**Hatalar:** `VET-VALIDATION-0001`, `VET-AUTHZ-0001`, `VET-TENANT-0001`.
