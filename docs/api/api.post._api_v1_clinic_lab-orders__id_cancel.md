# POST /api/v1/clinic/lab-orders/{id}/cancel

Lab order'ı iptal eder. `status='ordered'` veya
`'sample_collected'` veya `'in_progress'` → `'cancelled'`.
Numune alındıysa iptal notunda belirtilir (stok/maliyet
düzeltmesi).

- **Modül:** lab-orders
- **Yetki:** `clinic:lab:order` (yüksek yetki)
- **Audit:** `audit:lab_order.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`LabOrderCancelInput`):**

```json
POST /api/v1/clinic/lab-orders/lo-uuid/cancel
{
  "reason": "Hasta sahibi vazgeçti"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`LabOrder`):**

`LabOrder`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Lab order bulunamadı.
- (409) — Zaten `completed` veya `cancelled`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-order.ts`
- AI chunk: `flow-lab-order`
- Audit event: `audit:lab_order.cancel`
