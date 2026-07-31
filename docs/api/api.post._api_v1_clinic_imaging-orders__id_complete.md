# POST /api/v1/clinic/imaging-orders/{id}/complete

Görüntülemeyi kapatır. `status='reported'` veya
`'performed'` → `'completed'`. Rapor approve yerine
complete ile de tamamlanabilir (acil senaryo).

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:order`
- **Audit:** `audit:imaging_order.complete` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ notes?: string }`).

**Response 200 (`ImagingOrder`):**

`ImagingOrder`; `status='completed'`, `completedAt`,
`completedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Zaten `completed` veya `cancelled`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- AI chunk: `flow-imaging-order`
- Audit event: `audit:imaging_order.complete`
