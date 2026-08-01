# POST /api/v1/cd/receipts

İngiltere controlled-drug defterine satın alma/alım (`received`) kaydı ekler.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:prescription:create`
- **Audit:** `audit:cd.stock_received` (info)
- **Tenant izolasyonu:** tenant yalnız doğrulanmış actor bağlamından alınır.

`drugName`, `schedule` (S1-S5), `unit` (mg/ml), `quantity`, `branchId`,
`storageAreaId`, `supplier`, `lotNumber` ve `expiryDate` zorunludur. Kayıt
append-only'dir; fiziksel silme veya güncelleme yoktur.

**Hatalar:** `VET-VALIDATION-0001`, `VET-AUTHZ-0001`, `VET-TENANT-0001`.
