# GET /api/v1/inventory/stock-movements/{id}

ID'ye göre tek stok hareketi getirir. Cross-tenant → 404
`VET-STOCK-0001`.

- **Modül:** stock-movements
- **Yetki:** `inventory:stock_movement:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`StockMovement`):**

`StockMovement` şeması için bkz.
`POST /api/v1/inventory/stock-movements`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-STOCK-0001` (404) — Stok hareketi bulunamadı
  (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/stock-movement.ts`
- Liste: `GET /api/v1/inventory/stock-movements`
- Ters kayıt: `POST /api/v1/inventory/stock-movements/{id}/reverse`
- AI chunk: `flow-stock-movement`
