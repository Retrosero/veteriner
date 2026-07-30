# GET /api/v1/clinic/orders

Order listesi. Tenant-scoped; `patientId` / `type` / `status` / `from`
/ `to` / `limit` / `offset` filtreleri ile aranır.

- **Modül:** orders
- **Yetki:** `clinic:patient:read` (STAFF / VETERINARIAN)

**Query (`OrderFilters`):**

| Param       | Tip                | Zorunlu | Varsayılan | Açıklama                                        |
| ----------- | ------------------ | ------- | ---------- | ----------------------------------------------- |
| `patientId` | string             | hayır   | —          | Hastaya ait order'ları filtreler.               |
| `type`      | enum (8 değer)     | hayır   | —          | Order tipi filtresi.                            |
| `status`    | enum (4 değer)     | hayır   | —          | `pending` / `in_progress` / `completed` / `cancelled`. |
| `from`      | ISO 8601 datetime  | hayır   | —          | Oluşturma zamanı alt sınırı (UTC).             |
| `to`        | ISO 8601 datetime  | hayır   | —          | Oluşturma zamanı üst sınırı (UTC).             |
| `limit`     | int (1-200)        | hayır   | 20         | Sayfa başına kayıt.                             |
| `offset`    | int (0-10000)      | hayır   | 0          | Sayfa başlangıcı.                               |

**Response 200 (`OrderListResponse`):**

```json
{
  "items": [
    {
      "id": "order-7a1b2c3d-000001",
      "tenantId": "tnt-uuid",
      "examinationId": "exam-7a1b2c3d-9b1deb4d",
      "patientId": "33333333-3333-3333-333333333333",
      "type": "medication",
      "status": "pending",
      "description": "Amoksisilin 250 mg — 7 gün, günde 2 defa",
      "notes": null,
      "dueDate": "2026-08-06T00:00:00.000Z",
      "createdAt": "2026-07-30T10:30:00.000Z",
      "createdBy": "usr-vet-uuid",
      "completedAt": null,
      "completedBy": null,
      "cancelledAt": null,
      "cancellationReason": null
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Query parse hatası (enum, range).

**İş kuralları:**

- Repository `search(tenantId, filters)` tenant-scoped; `actor.tenantId`
  zorunlu, cross-tenant → 403 `VET-AUTHZ-0001`.
- Sıralama: oluşturma zamanına göre (en yeni önde).
- `from` / `to` oluşturma zamanına göre filtrelenir
  (`createdAt` ∈ [from, to]).
- `limit` / `offset` pagination için; `total` filtreye uyan tüm
  kayıtların sayısı (sayfa boyutundan bağımsız).

**Tenant izolasyonu:** Repository `search(tenantId, ...)` yalnızca
`actor.tenantId` kapsamında arar; başka tenant'ın order'ları asla
dönmez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/order.ts`
- Order oluştur: `POST /api/v1/clinic/examinations/{id}/orders`
- Order başlat: `POST /api/v1/clinic/orders/{id}/start`
- Tedavi planı: `GET /api/v1/clinic/patients/{id}/treatment-plan`
- AI chunk: `flow-treatment-plan`
