# POST /api/v1/petshop/sales/returns/{id}/complete

İade taslağını tamamlar. `status='draft'` → `status='completed'`.
Her line için atomik `StockMovement` (`type='return'`,
`direction='in'`) üretilir. Faz 7'de ödeme iadesi
(GOAL-073 tahsilat reversal) entegre edilir.

- **Modül:** petshop-sale-returns
- **Yetki:** `petshop:sale:refund`
- **Audit:** `audit:petshop_sale_return.complete` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ paymentMethod?: string,
refundMethod?: 'cash'|'card'|'credit' }` — Faz 7 tahsilat
ile bağlanır).

**Response 200 (`PetshopSaleReturnDetail`):**

`PetshopSaleReturnDetail`; `status='completed'`, `completedAt`,
`completedBy` set edilir. `lines[].stockMovementId` ile
stok hareket bağlantısı.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-RETURN-0001` (404) — İade bulunamadı.
- `VET-RETURN-0002` (409) — Yalnızca taslak tamamlanabilir.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Stok entegrasyonu (GOAL-063):**

- Her line için `StockMovement` (`type='return'`,
  `direction='in'`) atomik üretilir; bakiye geri alınır.
- `lotId` set edilmişse lot referansı bağlanır.

**Ödeme iadesi:** Faz 7'de `PaymentReversal` (GOAL-073)
ile `sourceType='petshop_sale_return'` olarak bağlanır;
`refundMethod='credit'` ise müşteri bakiyesine (GOAL-075)
eklenir.

**Audit detayı:** `totalRefund` + `newMovementIds[]` +
`refundMethod` payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale-return.ts`
- Detay: `GET /api/v1/petshop/sales/returns/{id}`
- Stok hareketi: `flow-stock-movement`
- AI chunk: `flow-petshop-sale-return`
- Audit event: `audit:petshop_sale_return.complete`
