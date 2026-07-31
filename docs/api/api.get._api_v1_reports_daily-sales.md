# GET /api/v1/reports/daily-sales

Günlük satış raporu. `dateFrom`/`dateTo` aralığında günlük
toplam satış (clinic_sale + petshop_sale). Para birimi
`currency` filtresi.

- **Modül:** reports
- **Yetki:** `clinic:report:financial:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`DailySalesReportFilters`):**

- `dateFrom` (ISO datetime) zorunlu.
- `dateTo` (ISO datetime) zorunlu.
- `currency` (ISO 4217) opsiyonel.
- `sourceType` (enum: `clinic_sale|petshop_sale`) opsiyonel.
- `branchId` (string|null) opsiyonel.

**Response 200 (`DailySalesReport`):**

```json
GET /api/v1/reports/daily-sales?dateFrom=2026-07-01&dateTo=2026-07-30&currency=TRY
{
  "dateFrom": "2026-07-01T00:00:00.000Z",
  "dateTo": "2026-07-30T23:59:59.000Z",
  "currency": "TRY",
  "days": [
    {
      "date": "2026-07-30",
      "totalAmount": "1500.00",
      "transactionCount": 8,
      "bySource": {
        "clinic_sale": "1100.00",
        "petshop_sale": "400.00"
      }
    }
  ],
  "totals": {
    "totalAmount": "45000.00",
    "transactionCount": 240,
    "averagePerDay": "1500.00"
  }
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
- Ödeme yöntemleri: `GET /api/v1/reports/payment-methods`
- Açık bakiyeler: `GET /api/v1/reports/open-balances`
- Export: `POST /api/v1/reports/export`
- AI chunk: `flow-report`
