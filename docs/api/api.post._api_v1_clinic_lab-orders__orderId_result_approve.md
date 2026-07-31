# POST /api/v1/clinic/lab-orders/{orderId}/result/approve

Submitted sonuçları onaylar. `status='approved'`.
Onay sonrası hasta sahibi/portal görebilir.

- **Modül:** lab-results
- **Yetki:** `clinic:lab:enter_result` (yüksek yetki,
  genelde uzman)
- **Audit:** `audit:lab_result.approve` (info)

**Path parametreleri:**

- `orderId` (UUID) zorunlu.

**Request body (`LabResultApproveInput`):**

```json
POST /api/v1/clinic/lab-orders/lo-uuid/result/approve
{
  "resultIds": ["lr-uuid", "lr-uuid-2"],
  "notes": "Klinikopatolojik korelasyon OK"
}
```

- `resultIds` (string[]) opsiyonel — set edilirse yalnız
  bunlar approve olur; aksi halde tüm submitted'lar.
- `notes` opsiyonel.

**Response 200 (`LabOrder`):**

`LabOrder`; sonuçlar `status='approved'`, `approvedAt`,
`approvedBy` set edilir; order `completed` ise
tamamlandı.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order veya sonuç bulunamadı.
- (409) — Yalnızca `submitted` approve edilebilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-result.ts`
- Amend: `POST .../result/amend`
- AI chunk: `flow-lab-result`
- Audit event: `audit:lab_result.approve`
