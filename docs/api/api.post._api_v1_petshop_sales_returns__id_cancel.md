# POST /api/v1/petshop/sales/returns/{id}/cancel

İadeyi iptal eder. `status='draft'` veya `'completed'` →
`'cancelled'`. `completed` ise her line için `reversal`
stok hareketi otomatik üretilir (iade geri alınır).

- **Modül:** petshop-sale-returns
- **Yetki:** `petshop:sale:refund`
- **Audit:** `audit:petshop_sale_return.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`PetshopSaleReturnCancelInput`):**

```json
POST /api/v1/petshop/sales/returns/psr-uuid/cancel
{
  "reason": "Müşteri iadeyi geri çekti"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`PetshopSaleReturnDetail`):**

`PetshopSaleReturnDetail`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-RETURN-0001` (404) — İade bulunamadı.
- `VET-RETURN-0003` (409) — Bu durumdaki iade iptal
  edilemez.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Stok etkisi:** `completed` iade iptal edilirse her line
için ters kayıt (`type='reversal'`, `direction='out'`)
üretilir; bakiye tekrar düşer (iadeyi geri al).

**Audit detayı:** `reason` + `previousStatus` +
`newMovementIds[]` payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale-return.ts`
- Detay: `GET /api/v1/petshop/sales/returns/{id}`
- Stok hareketi: `flow-stock-movement`
- AI chunk: `flow-petshop-sale-return`
- Audit event: `audit:petshop_sale_return.cancel`
