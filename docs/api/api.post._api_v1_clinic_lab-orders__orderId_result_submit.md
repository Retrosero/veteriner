# POST /api/v1/clinic/lab-orders/{orderId}/result/submit

Tüm draft sonuçları `submitted` yapar. Sonuçlar
approve edilmeden hasta sahibi/portal göremez.

- **Modül:** lab-results
- **Yetki:** `clinic:lab:enter_result`
- **Audit:** `audit:lab_result.submit` (info)

**Path parametreleri:**

- `orderId` (UUID) zorunlu.

**Request body:** opsiyonel (`{ note?: string }`).

**Response 200 (`LabOrder`):**

`LabOrder`; submit edilen sonuçlar `status='submitted'`,
`submittedAt`, `submittedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- (404) — Order bulunamadı.
- (409) — Draft sonuç yok veya order zaten
  `completed`/`cancelled`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-result.ts`
- Approve: `POST .../result/approve`
- AI chunk: `flow-lab-result`
- Audit event: `audit:lab_result.submit`
