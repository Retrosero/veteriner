# PATCH /api/v1/clinic/lab-orders/{orderId}/result

Sonuç kısmi güncelleme. Yalnız `status='draft'`
güncellenebilir (409). Approve/amend ayrı endpoint.

- **Modül:** lab-results
- **Yetki:** `clinic:lab:enter_result`
- **Audit:** `audit:lab_result.update` (info)

**Path parametreleri:**

- `orderId` (UUID) zorunlu.

**Request body (`LabResultUpdateInput`):**

```json
PATCH /api/v1/clinic/lab-orders/lo-uuid/result
{
  "resultId": "lr-uuid",
  "value": "13.0",
  "abnormalFlag": "high",
  "notes": "Düzeltildi"
}
```

- `resultId` (string) zorunlu.
- `value`, `unit`, `abnormalFlag`,
  `referenceRangeLow`/`referenceRangeHigh`, `notes`
  opsiyonel; en az bir alan.

**Response 200 (`LabResult`):**

`LabResult` şeması için bkz. `POST .../result`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Sonuç bulunamadı.
- (409) — Yalnızca `draft` güncellenebilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-result.ts`
- AI chunk: `flow-lab-result`
- Audit event: `audit:lab_result.update`
