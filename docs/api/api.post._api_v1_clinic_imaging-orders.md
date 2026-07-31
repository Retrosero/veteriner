# POST /api/v1/clinic/imaging-orders

Yeni görüntüleme isteği. `modality`: `xray` (röntgen) |
`ultrasound` (USG) | `ct` (bilgisayarlı tomografi) | `mri`
(manyetik rezonans) | `dental_xray` (diş röntgeni).
`status='ordered'`.

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:order`
- **Audit:** `audit:imaging_order.create` (info)

**Request body (`ImagingOrderCreateInput`):**

```json
POST /api/v1/clinic/imaging-orders
{
  "patientId": "pat-uuid",
  "modality": "xray",
  "bodyPart": "thorax",
  "orderedById": "usr-uuid",
  "priority": "urgent",
  "notes": "Öksürük + ateş 3 gün"
}
```

- `patientId` (string) zorunlu.
- `modality` (enum) zorunlu.
- `bodyPart` (string, 1-100) zorunlu.
- `orderedById` (string) zorunlu.
- `priority` (enum: `routine|urgent|stat`) opsiyonel.
- `notes` (string) opsiyonel.

**Response 201 (`ImagingOrder`):**

```json
{
  "id": "io-uuid",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
  "modality": "xray",
  "bodyPart": "thorax",
  "status": "ordered",
  "orderedAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Patient bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- Liste: `GET /api/v1/clinic/imaging-orders`
- Detay: `GET /api/v1/clinic/imaging-orders/{id}`
- Planla: `POST .../schedule`
- Gerçekleştir: `POST .../perform`
- Rapor: `POST .../report`
- AI chunk: `flow-imaging-order`
- Audit event: `audit:imaging_order.create`
