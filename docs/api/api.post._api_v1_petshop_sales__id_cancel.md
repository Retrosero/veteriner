# POST /api/v1/petshop/sales/{id}/cancel

Satışı iptal eder. `status='draft'` veya `'completed'` →
`'cancelled'`. `completed` satışlar için her line'ın
`reversal` stok hareketi otomatik üretilir (stok iade).

- **Modül:** petshop-sales
- **Yetki:** `petshop:sale:refund` (yüksek yetki)
- **Audit:** `audit:petshop_sale.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`PetshopSaleCancelInput`):**

```json
POST /api/v1/petshop/sales/ps-uuid/cancel
{
  "reason": "Müşteri vazgeçti"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`PetshopSaleDetail`):**

`PetshopSaleDetail`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir. `completed` ise
her line için `lines[].reversalMovementId` ile ters kayıt
bağlantısı.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-SALE-0001` (404) — Satış bulunamadı.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Stok etkisi:**

- `completed` satışlar iptal edilirse her line için
  `StockMovement` (`type='reversal'`, `direction='in'`)
  üretilir; bakiye atomik geri alınır.
- `draft` satışlar iptal edilirse stok hareketi yok
  (henüz düşüm yapılmamıştı).
- `cancelled` zaten → 409 VET-SALE-0005 (idempotent
  çift iptal engellendi).

**Tam iade için:** Faz 6 satış iadesi (GOAL-065
petshop-sale-returns) ayrı bir akış; burada yalnızca
iptal + reversal.

**Audit detayı:** `reason` + `previousStatus` +
`newMovementIds[]` payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale.ts`
- Detay: `GET /api/v1/petshop/sales/{id}`
- İade: `flow-petshop-sale-return` (GOAL-065)
- Stok hareketi: `flow-stock-movement`
- AI chunk: `flow-petshop-sale`
- Audit event: `audit:petshop_sale.cancel`
