# POST /api/v1/clinic/imaging-orders/{id}/approve-report

Raporu onaylar. `status='reported'` → `'completed'`.
Onay sonrası rapor finalize olur; hasta sahibi/portal
görebilir.

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:report` (yüksek yetki,
  radyolog uzman)
- **Audit:** `audit:imaging_order.approve_report` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ notes?: string }`).

**Response 200 (`ImagingOrder`):**

`ImagingOrder`; `status='completed'`, `reportApprovedAt`,
`reportApprovedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Yalnızca `reported` approve edilebilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- Amend: `POST .../amend-report`
- AI chunk: `flow-imaging-order`
- Audit event: `audit:imaging_order.approve_report`
