# GET /api/v1/clinic/lab-orders/{orderId}/result

Order için sonuç listesi. `status`/`analyte` filtreleri.

- **Modül:** lab-results
- **Yetki:** `clinic:lab:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `orderId` (UUID) zorunlu.

**Query parametreleri:**

- `status` (enum: `draft|submitted|approved|amended`)
  opsiyonel.
- `analyte` (string) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`LabResultListResponse`):**

```json
GET /api/v1/clinic/lab-orders/lo-uuid/result
{
  "items": [
    {
      "id": "lr-uuid",
      "analyte": "WBC",
      "value": "12.5",
      "unit": "10^3/µL",
      "abnormalFlag": "high",
      "status": "approved"
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.
- (404) — Order bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-result.ts`
- Oluştur: `POST /api/v1/clinic/lab-orders/{orderId}/result`
- AI chunk: `flow-lab-result`
