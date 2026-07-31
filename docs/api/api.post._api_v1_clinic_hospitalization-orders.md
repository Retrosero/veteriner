# POST /api/v1/clinic/hospitalization-orders

Yeni yatış order (tedavi/talimat). Bir yatışa bağlı.
`type`: `medication` | `fluid_therapy` | `feeding` |
`monitoring` | `procedure` | `other`. `status='active'`.

- **Modül:** hospitalization-orders
- **Yetki:** `clinic:hospitalization:add_note`
- **Audit:** `audit:hospitalization_order.create` (info)

**Request body (`HospitalizationOrderCreateInput`):**

```json
POST /api/v1/clinic/hospitalization-orders
{
  "hospitalizationId": "hosp-uuid",
  "patientId": "pat-uuid",
  "type": "medication",
  "name": "Amoksisilin 250 mg",
  "dose": "1 tablet",
  "frequency": "BID",
  "route": "po",
  "startAt": "2026-07-30T15:00:00.000Z",
  "endAt": "2026-08-05T15:00:00.000Z",
  "notes": "Yemeklerle birlikte"
}
```

- `hospitalizationId` (string) zorunlu.
- `patientId` (string) zorunlu.
- `type` (enum) zorunlu.
- `name` (string, 1-200) zorunlu.
- `dose`, `frequency`, `route` opsiyonel.
- `startAt` (ISO datetime) zorunlu.
- `endAt` (ISO datetime) opsiyonel.
- `notes` opsiyonel.

**Response 201 (`HospitalizationOrder`):**

```json
{
  "id": "ho-uuid",
  "tenantId": "tnt-uuid",
  "hospitalizationId": "hosp-uuid",
  "patientId": "pat-uuid",
  "type": "medication",
  "name": "Amoksisilin 250 mg",
  "status": "active",
  "startAt": "2026-07-30T15:00:00.000Z",
  "endAt": "2026-08-05T15:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Yatış/patient bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization-order.ts`
- Liste: `GET /api/v1/clinic/hospitalization-orders`
- Detay: `GET /api/v1/clinic/hospitalization-orders/{id}`
- Güncelle: `PATCH /api/v1/clinic/hospitalization-orders/{id}`
- İptal: `POST /api/v1/clinic/hospitalization-orders/{id}/cancel`
- Schedule: `POST /api/v1/clinic/hospitalization-orders/{id}/schedules`
- AI chunk: `flow-hospitalization-order`
- Audit event: `audit:hospitalization_order.create`
