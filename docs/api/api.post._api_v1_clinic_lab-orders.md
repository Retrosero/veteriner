# POST /api/v1/clinic/lab-orders

Yeni laboratuvar isteği. `patientId` + `labTestId` +
`orderedById` zorunlu. `priority`: `routine` (default) |
`urgent` | `stat`. `status='ordered'`.

- **Modül:** lab-orders
- **Yetki:** `clinic:lab:order`
- **Audit:** `audit:lab_order.create` (info)

**Request body (`LabOrderCreateInput`):**

```json
POST /api/v1/clinic/lab-orders
{
  "patientId": "pat-uuid",
  "labTestId": "lt-uuid",
  "orderedById": "usr-uuid",
  "priority": "urgent",
  "notes": "Lethargy + ateş 2 gündür"
}
```

- `patientId` (string) zorunlu.
- `labTestId` (string) zorunlu.
- `orderedById` (string) zorunlu.
- `priority` (enum) opsiyonel, default `routine`.
- `notes` (string) opsiyonel.

**Response 201 (`LabOrder`):**

```json
{
  "id": "lo-uuid",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
  "labTestId": "lt-uuid",
  "orderedById": "usr-uuid",
  "priority": "urgent",
  "status": "ordered",
  "orderedAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Patient veya test bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-order.ts`
- Liste: `GET /api/v1/clinic/lab-orders`
- Detay: `GET /api/v1/clinic/lab-orders/{id}`
- Numune al: `POST /api/v1/clinic/lab-orders/{id}/collect`
- Başlat: `POST /api/v1/clinic/lab-orders/{id}/start`
- Tamamla: `POST /api/v1/clinic/lab-orders/{id}/complete`
- İptal: `POST /api/v1/clinic/lab-orders/{id}/cancel`
- Sonuç: `flow-lab-result` (GOAL-092)
- AI chunk: `flow-lab-order`
- Audit event: `audit:lab_order.create`
