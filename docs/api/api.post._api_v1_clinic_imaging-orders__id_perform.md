# POST /api/v1/clinic/imaging-orders/{id}/perform

Görüntülemeyi gerçekleştirir. `status='scheduled'` →
`'performed'`. `performedAt` + `performedBy` +
`imageIds[]` (PACS/DICOM ref) set edilir.

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:perform`
- **Audit:** `audit:imaging_order.perform` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ImagingOrderPerformInput`):**

```json
POST /api/v1/clinic/imaging-orders/io-uuid/perform
{
  "imageIds": ["dicom-uuid-1", "dicom-uuid-2"],
  "notes": "2 proje alındı (lateral + VD)"
}
```

- `imageIds` (string[]) zorunlu.
- `notes` opsiyonel.

**Response 200 (`ImagingOrder`):**

`ImagingOrder`; `status='performed'`, `performedAt`,
`performedBy`, `imageIds` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Yalnızca `scheduled` gerçekleştirilebilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- Rapor: `POST .../report`
- AI chunk: `flow-imaging-order`
- Audit event: `audit:imaging_order.perform`
