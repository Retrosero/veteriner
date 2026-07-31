# POST /api/v1/clinic/imaging-orders/{id}/cancel

Görüntülemeyi iptal eder. `status='ordered'` veya
`'scheduled'` → `'cancelled'`. Performed sonrası iptal
edilemez; `complete` veya `cancel` ayrı akış.

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:order` (yüksek yetki)
- **Audit:** `audit:imaging_order.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ImagingOrderCancelInput`):**

```json
POST /api/v1/clinic/imaging-orders/io-uuid/cancel
{
  "reason": "Hasta sahibi vazgeçti"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`ImagingOrder`):**

`ImagingOrder`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Zaten `performed`/`completed`/`cancelled`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- AI chunk: `flow-imaging-order`
- Audit event: `audit:imaging_order.cancel`
