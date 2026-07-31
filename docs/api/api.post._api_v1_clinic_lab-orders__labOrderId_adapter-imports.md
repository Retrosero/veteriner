# POST /api/v1/clinic/lab-orders/{labOrderId}/adapter-imports

Dış cihazdan/laboratuvardan gelen sonuç import kaydı
oluşturur. `adapterId` + `externalReference` + `format`
zorunlu. Async işlenir; `status='pending'`.

- **Modül:** lab-adapters
- **Yetki:** `clinic:lab:enter_result`
- **Audit:** `audit:lab_adapter_import.create` (info)

**Path parametreleri:**

- `labOrderId` (UUID) zorunlu.

**Request body (`LabAdapterImportCreateInput`):**

```json
POST /api/v1/clinic/lab-orders/lo-uuid/adapter-imports
{
  "adapterId": "adapter-uuid",
  "externalReference": "EXT-2026-0001",
  "format": "hl7",
  "rawPayload": "MS4uLi4="
}
```

- `adapterId` (string) zorunlu.
- `externalReference` (string) zorunlu.
- `format` (enum) zorunlu.
- `rawPayload` (string, base64) zorunlu.

**Response 201 (`LabAdapterImport`):**

```json
{
  "id": "lai-uuid",
  "labOrderId": "lo-uuid",
  "adapterId": "adapter-uuid",
  "format": "hl7",
  "status": "pending",
  "externalReference": "EXT-2026-0001",
  "createdAt": "2026-07-30T15:00:00.000Z"
}
```

- `status`: `pending` | `processing` | `completed` | `failed`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order veya adapter bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-adapter.ts`
- Liste: `GET .../lab-adapter-imports`
- Detay: `GET .../lab-adapter-imports/{id}`
- Sonuç: `flow-lab-result`
- AI chunk: `flow-lab-adapter`
- Audit event: `audit:lab_adapter_import.create`
