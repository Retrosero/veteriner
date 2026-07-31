# POST /api/v1/clinic/lab-orders/{orderId}/result/amend

Approved sonucu amendment ile düzeltir. Eski sonuç
korunur (append-only); yeni sonuç oluşturulur.

- **Modül:** lab-results
- **Yetki:** `clinic:lab:amend` (yüksek yetki)
- **Audit:** `audit:lab_result.amend` (warning)

**Path parametreleri:**

- `orderId` (UUID) zorunlu.

**Request body (`LabResultAmendInput`):**

```json
POST /api/v1/clinic/lab-orders/lo-uuid/result/amend
{
  "resultId": "lr-uuid",
  "value": "11.0",
  "abnormalFlag": "normal",
  "amendReason": "Cihaz kalibrasyon hatası düzeltildi"
}
```

- `resultId` (string) zorunlu.
- `value` (string) zorunlu.
- `unit`/`abnormalFlag` opsiyonel.
- `amendReason` (string, 1-2000) zorunlu.

**Response 201 (`LabResult`):**

`LabResult`; `status='amended'`, `amendedFromId=
resultId` (orijinal), `amendedAt`, `amendedBy`,
`amendReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Sonuç bulunamadı.
- (409) — Yalnızca `approved` amend edilebilir.

**Append-only:** Orijinal sonuç korunur; amendment
ayrı kayıt.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-result.ts`
- Geçmiş: `GET .../result/history`
- AI chunk: `flow-lab-result`
- Audit event: `audit:lab_result.amend`
