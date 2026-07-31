# PATCH /api/v1/clinic/hospitalization-orders/{id}

Yatış order kısmi güncelleme. Yalnız `status='active'`
güncellenebilir (409). Tamamlandı/iptal order'lar read-only.

- **Modül:** hospitalization-orders
- **Yetki:** `clinic:hospitalization:add_note`
- **Audit:** `audit:hospitalization_order.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`HospitalizationOrderUpdateInput`):**

```json
PATCH /api/v1/clinic/hospitalization-orders/ho-uuid
{
  "dose": "2 tablet",
  "notes": "Doz artırıldı"
}
```

- `name`, `dose`, `frequency`, `route`, `startAt`, `endAt`,
  `notes` opsiyonel; en az bir alan.

**Response 200 (`HospitalizationOrder`):**

`HospitalizationOrder` şeması için bkz.
`POST /api/v1/clinic/hospitalization-orders`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Yalnızca `active` güncellenebilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization-order.ts`
- Detay: `GET /api/v1/clinic/hospitalization-orders/{id}`
- AI chunk: `flow-hospitalization-order`
- Audit event: `audit:hospitalization_order.update`
