# GET /api/v1/reports/payment-methods

Ödeme yöntemi dağılımı raporu. Tarih aralığında
`method` (cash/card/bank_transfer/other) × tutar +
işlem adedi.

- **Modül:** reports
- **Yetki:** `clinic:report:financial:read`
- **Audit:** yok (salt okunur)

**Query parametreleri:**

- `dateFrom` (ISO datetime) zorunlu.
- `dateTo` (ISO datetime) zorunlu.
- `currency` (ISO 4217) opsiyonel.
- `sourceType` (enum: `clinic_sale|petshop_sale`) opsiyonel.

**Response 200 (`PaymentMethodsReport`):**

```json
GET /api/v1/reports/payment-methods?dateFrom=2026-07-01&dateTo=2026-07-30
{
  "dateFrom": "2026-07-01T00:00:00.000Z",
  "dateTo": "2026-07-30T23:59:59.000Z",
  "methods": [
    {
      "method": "cash",
      "totalAmount": "28000.00",
      "transactionCount": 180
    },
    {
      "method": "card",
      "totalAmount": "15000.00",
      "transactionCount": 60
    }
  ],
  "totalAmount": "43000.00",
  "totalTransactionCount": 240
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/report.ts`
- Günlük satış: `GET /api/v1/reports/daily-sales`
- Açık bakiyeler: `GET /api/v1/reports/open-balances`
- AI chunk: `flow-report`
