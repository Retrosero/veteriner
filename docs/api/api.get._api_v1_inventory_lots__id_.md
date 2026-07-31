# GET /api/v1/inventory/lots/{id}

ID'ye göre tek lot getirir. Cross-tenant → 404 `VET-INV-0003`
(controller service farklı kod kullanabilir, 404 aynı
anlama gelir).

- **Modül:** inventory
- **Yetki:** `inventory:lot:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`StockLot`):**

`StockLot` şeması için bkz. `POST /api/v1/inventory/lots`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-INV-0003` (404) — Lot bulunamadı (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/inventory.ts`
- Liste: `GET /api/v1/inventory/lots`
- AI chunk: `flow-inventory-lot`
