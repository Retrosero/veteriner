# GET /api/v1/reports/open-balances

Açık bakiye (tahsil edilmemiş) raporu. Owner × tahsil
edilmemiş tutar + en eski fatura tarihi. Tahsilat takibi
için.

- **Modül:** reports
- **Yetki:** `clinic:report:financial:read`
- **Audit:** yok (salt okunur)

**Query parametreleri:**

- `minAmount` (Decimal) opsiyonel — minimum bakiye.
- `currency` (ISO 4217) opsiyonel.
- `branchId` (string|null) opsiyonel.
- `limit` (integer, 1-500, default 100).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`OpenBalancesReport`):**

```json
GET /api/v1/reports/open-balances?minAmount=100
{
  "items": [
    {
      "ownerId": "own-uuid",
      "ownerName": "Ali Yılmaz",
      "totalDebit": "500.00",
      "oldestInvoiceAt": "2026-06-15T00:00:00.000Z",
      "openInvoiceCount": 2,
      "currency": "TRY"
    }
  ],
  "total": 1,
  "totalDebtAmount": "500.00"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.

**Sıralama:** Default `totalDebit DESC` (en büyük borçlu
önce). `oldestInvoiceAt` tahsilat önceliği için kullanılır.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/report.ts`
- Günlük satış: `GET /api/v1/reports/daily-sales`
- Ödeme yöntemleri: `GET /api/v1/reports/payment-methods`
- Müşteri bakiye: `GET /api/v1/customer-balances/owners/{ownerId}`
- AI chunk: `flow-report`
