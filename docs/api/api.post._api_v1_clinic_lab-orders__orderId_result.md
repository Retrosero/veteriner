# POST /api/v1/clinic/lab-orders/{orderId}/result

Lab sonucu girer (analyte bazında). Order
`status='in_progress'` iken yapılır. `status='draft'`.

- **Modül:** lab-results
- **Yetki:** `clinic:lab:enter_result`
- **Audit:** `audit:lab_result.create` (info)

**Path parametreleri:**

- `orderId` (UUID) zorunlu — lab order id.

**Request body (`LabResultCreateInput`):**

```json
POST /api/v1/clinic/lab-orders/lo-uuid/result
{
  "analyte": "WBC",
  "value": "12.5",
  "unit": "10^3/µL",
  "abnormalFlag": "high",
  "referenceRangeLow": "6",
  "referenceRangeHigh": "17",
  "notes": "Hafif yüksek"
}
```

- `analyte` (string, 1-100) zorunlu.
- `value` (string) zorunlu.
- `unit` (string, 1-30) opsiyonel.
- `abnormalFlag` (enum: `low|normal|high|critical_low|
  critical_high`) opsiyonel.
- `referenceRangeLow`/`referenceRangeHigh` (string)
  opsiyonel.
- `notes` (string) opsiyonel.

**Response 201 (`LabResult`):**

```json
{
  "id": "lr-uuid",
  "orderId": "lo-uuid",
  "analyte": "WBC",
  "value": "12.5",
  "unit": "10^3/µL",
  "abnormalFlag": "high",
  "enteredAt": "2026-07-30T14:00:00.000Z",
  "enteredBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Order `cancelled`/`completed` iken
  sonuç girilemez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-result.ts`
- Liste: `GET /api/v1/clinic/lab-orders/{orderId}/result`
- Geçmiş: `GET /api/v1/clinic/lab-orders/{orderId}/result/history`
- Güncelle: `PATCH /api/v1/clinic/lab-orders/{orderId}/result`
- Submit: `POST /api/v1/clinic/lab-orders/{orderId}/result/submit`
- Approve: `POST /api/v1/clinic/lab-orders/{orderId}/result/approve`
- Amend: `POST /api/v1/clinic/lab-orders/{orderId}/result/amend`
- AI chunk: `flow-lab-result`
- Audit event: `audit:lab_result.create`
