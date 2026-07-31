# GET /api/v1/clinic/lab-orders/{orderId}/result/history

Order için sonuç geçmişi (amendment dahil). Append-only;
eski değerler korunur.

- **Modül:** lab-results
- **Yetki:** `clinic:lab:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `orderId` (UUID) zorunlu.

**Query parametreleri:**

- `analyte` (string) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`LabResultHistoryResponse`):**

```json
GET /api/v1/clinic/lab-orders/lo-uuid/result/history
{
  "items": [
    {
      "id": "lr-uuid",
      "analyte": "WBC",
      "value": "12.5",
      "status": "approved",
      "amendedFromId": null,
      "enteredAt": "2026-07-30T14:00:00.000Z"
    },
    {
      "id": "lr-uuid-2",
      "analyte": "WBC",
      "value": "13.0",
      "status": "amended",
      "amendedFromId": "lr-uuid",
      "enteredAt": "2026-08-01T10:00:00.000Z"
    }
  ],
  "total": 2
}
```

- `amendedFromId` — önceki sonuç id (null ise orijinal).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.
- (404) — Order bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-result.ts`
- AI chunk: `flow-lab-result`
