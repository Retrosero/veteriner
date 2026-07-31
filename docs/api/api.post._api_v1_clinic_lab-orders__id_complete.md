# POST /api/v1/clinic/lab-orders/{id}/complete

Testi tamamlar. `status='in_progress'` → `'completed'`.
Sonuçlar (GOAL-092) bu endpoint ile birlikte girilebilir
veya `LabResult` modülünden sonradan.

- **Modül:** lab-orders
- **Yetki:** `clinic:lab:enter_result`
- **Audit:** `audit:lab_order.complete` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`LabOrderCompleteInput`):**

```json
POST /api/v1/clinic/lab-orders/lo-uuid/complete
{
  "results": [
    {
      "analyte": "WBC",
      "value": "12.5",
      "unit": "10^3/µL",
      "abnormalFlag": "high"
    }
  ],
  "notes": "Hafif lökositoz"
}
```

- `results[]` opsiyonel — sonuçlar (LabResult modülü ile
  senkronize).
- `notes` opsiyonel.

**Response 200 (`LabOrder`):**

`LabOrder`; `status='completed'`, `completedAt`,
`completedBy` set edilir; resultId referansları.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Lab order bulunamadı.
- (409) — Yalnızca `in_progress` tamamlanabilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-order.ts`
- Detay: `GET /api/v1/clinic/lab-orders/{id}`
- Sonuç: `flow-lab-result` (GOAL-092)
- AI chunk: `flow-lab-order`
- Audit event: `audit:lab_order.complete`
