# POST /api/v1/petshop/sales/{id}/complete

Taslak satışı tamamlar. `status='draft'` → `status='completed'`.
Her line için atomik stok düşümü yapılır (Faz 6
`StockMovement` `type='sale'`, `direction='out'`). Yetersiz
stok → 422 `VET-SALE-0007`.

- **Modül:** petshop-sales
- **Yetki:** `petshop:sale:create`
- **Audit:** `audit:petshop_sale.complete` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ paymentMethod?: string }` —
Faz 7 tahsilat ile bağlanır).

**Response 200 (`PetshopSaleDetail`):**

`PetshopSaleDetail`; `status='completed'`, `completedAt`,
`completedBy` set edilir. `lines[].stockMovementId` ile
stok hareket bağlantısı.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-SALE-0001` (404) — Satış bulunamadı.
- `VET-SALE-0002` (409) — Yalnızca taslak tamamlanabilir.
- `VET-SALE-0007` (422) — Yetersiz stok.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Stok entegrasyonu (GOAL-063):**

- Her line için `StockMovement` (`type='sale'`,
  `direction='out'`) otomatik üretilir.
- `lotId` set edilmişse lot referansı bağlanır; SKT
  kontrolü yapılır.
- Bakiye atomik olarak düşer.

**Audit detayı:** `lineCount` + `totalAmount` +
`newMovementIds[]` payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale.ts`
- Detay: `GET /api/v1/petshop/sales/{id}`
- Stok hareketi: `flow-stock-movement`
- AI chunk: `flow-petshop-sale`
- Audit event: `audit:petshop_sale.complete`
