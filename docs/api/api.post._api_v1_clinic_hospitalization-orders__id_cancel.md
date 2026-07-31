# POST /api/v1/clinic/hospitalization-orders/{id}/cancel

Yatış order'ı iptal eder. `status='active'` →
`'cancelled'`. Zamanlamalar (schedules) da iptal olur.

- **Modül:** hospitalization-orders
- **Yetki:** `clinic:hospitalization:admit` (yüksek yetki)
- **Audit:** `audit:hospitalization_order.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`HospitalizationOrderCancelInput`):**

```json
POST /api/v1/clinic/hospitalization-orders/ho-uuid/cancel
{
  "reason": "Yan etki görüldü"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`HospitalizationOrder`):**

`HospitalizationOrder`; `status='cancelled'`,
`cancelledAt`, `cancelledBy`, `cancelReason` set edilir;
pending schedules `skipped` flag'lenir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Zaten `cancelled` veya `completed`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization-order.ts`
- AI chunk: `flow-hospitalization-order`
- Audit event: `audit:hospitalization_order.cancel`
