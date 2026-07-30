# GET /api/v1/clinic/patients/{id}/treatment-plan

Hastaya ait tüm order'ları aktif (`pending` + `in_progress`) ve
tamamlanmış (`completed` + `cancelled`) olarak iki dizide döner.
Tedavi planı görünümü: ilk aşamada `active`, sonra `completed`
gruplar.

- **Modül:** orders
- **Yetki:** `clinic:patient:read` (STAFF / VETERINARIAN)

**Path params:**

- `id` (string, zorunlu) — Hasta ID.

**Query:** Yok.

**Response 200 (`OrderTreatmentPlan`):**

```json
{
  "patientId": "33333333-3333-3333-333333333333",
  "active": [
    {
      "id": "order-7a1b2c3d-000002",
      "tenantId": "tnt-uuid",
      "examinationId": "exam-7a1b2c3d-9b1deb4d",
      "patientId": "33333333-3333-3333-333333333333",
      "type": "lab",
      "status": "pending",
      "description": "CBC + biyokimya paneli",
      "notes": null,
      "dueDate": null,
      "createdAt": "2026-07-30T10:35:00.000Z",
      "createdBy": "usr-vet-uuid",
      "completedAt": null,
      "completedBy": null,
      "cancelledAt": null,
      "cancellationReason": null
    }
  ],
  "completed": [
    {
      "id": "order-7a1b2c3d-000001",
      "tenantId": "tnt-uuid",
      "examinationId": "exam-7a1b2c3d-9b1deb4d",
      "patientId": "33333333-3333-3333-333333333333",
      "type": "medication",
      "status": "completed",
      "description": "Amoksisilin 250 mg — 7 gün, günde 2 defa",
      "notes": null,
      "dueDate": "2026-08-06T00:00:00.000Z",
      "createdAt": "2026-07-30T10:30:00.000Z",
      "createdBy": "usr-vet-uuid",
      "completedAt": "2026-07-30T11:15:00.000Z",
      "completedBy": "usr-vet-uuid",
      "cancelledAt": null,
      "cancellationReason": null
    }
  ]
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.

**İş kuralları:**

- `active` dizisi `status='pending'` veya `'in_progress'` order'ları
  içerir.
- `completed` dizisi `status='completed'` veya `'cancelled'`
  order'ları içerir.
- Repository `search(tenantId, { patientId, limit: 200, offset: 0 })`
  ile çekilir; hasta başına en fazla 200 order desteklenir (pagination
  gerekirse list endpoint'ine yönlendirilir).
- Sıralama: oluşturma zamanına göre (en yeni önde).
- Hasta ID'si cross-tenant → boş `active` + boş `completed` (tenant
  filter zaten boş döndürür; bilgi sızdırmaz).

**Tenant izolasyonu:** Repository `search(tenantId, ...)` yalnızca
`actor.tenantId` kapsamında arar; başka tenant'ın order'ları asla
dönmez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/order.ts`
- Order oluştur: `POST /api/v1/clinic/examinations/{id}/orders`
- Order listesi: `GET /api/v1/clinic/orders`
- Order başlat: `POST /api/v1/clinic/orders/{id}/start`
- Order tamamla: `POST /api/v1/clinic/orders/{id}/complete`
- Order iptal: `POST /api/v1/clinic/orders/{id}/cancel`
- AI chunk: `flow-treatment-plan`
