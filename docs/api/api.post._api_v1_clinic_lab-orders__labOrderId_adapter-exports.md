# POST /api/v1/clinic/lab-orders/{labOrderId}/adapter-exports

Lab order'ı dış cihaza/laboratuvara gönderim için
export kaydı oluşturur. `adapterId` (dış provider) +
`format`: `hl7` | `fhir` | `astm` | `proprietary` seçilir.
Async işlenir; `status='pending'`.

- **Modül:** lab-adapters
- **Yetki:** `clinic:lab:order`
- **Audit:** `audit:lab_adapter_export.create` (info)

**Path parametreleri:**

- `labOrderId` (UUID) zorunlu.

**Request body (`LabAdapterExportCreateInput`):**

```json
POST /api/v1/clinic/lab-orders/lo-uuid/adapter-exports
{
  "adapterId": "adapter-uuid",
  "format": "hl7",
  "externalReference": "EXT-2026-0001"
}
```

- `adapterId` (string) zorunlu.
- `format` (enum) zorunlu.
- `externalReference` (string) opsiyonel — dış taraf
  referansı.

**Response 201 (`LabAdapterExport`):**

```json
{
  "id": "lae-uuid",
  "labOrderId": "lo-uuid",
  "adapterId": "adapter-uuid",
  "format": "hl7",
  "status": "pending",
  "externalReference": "EXT-2026-0001",
  "createdAt": "2026-07-30T14:00:00.000Z"
}
```

- `status`: `pending` | `processing` | `completed` | `failed`
  | `cancelled`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order veya adapter bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-adapter.ts`
- Liste: `GET /api/v1/clinic/lab-adapter-exports`
- Detay: `GET .../lab-adapter-exports/{id}`
- Yeniden dene: `POST .../lab-adapter-exports/{id}/retry`
- İptal: `POST .../lab-adapter-exports/{id}/cancel`
- AI chunk: `flow-lab-adapter`
- Audit event: `audit:lab_adapter_export.create`
