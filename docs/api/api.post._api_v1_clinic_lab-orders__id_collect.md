# POST /api/v1/clinic/lab-orders/{id}/collect

Numune alımı kaydeder. `status='ordered'` →
`'sample_collected'`. `collectedAt`, `collectedBy`,
`specimenType` (LabTest'ten snapshot), `specimenId`/
`volumeMl` opsiyonel.

- **Modül:** lab-orders
- **Yetki:** `clinic:lab:collect_sample`
- **Audit:** `audit:lab_order.collect` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`LabOrderCollectInput`):**

```json
POST /api/v1/clinic/lab-orders/lo-uuid/collect
{
  "specimenId": "SPEC-2026-0001",
  "volumeMl": "3",
  "notes": "Sağ antekübital venden alındı"
}
```

- `specimenId` (string, 1-100) opsiyonel — barkod/lab
  numarası.
- `volumeMl` (string) opsiyonel.
- `notes` (string) opsiyonel.

**Response 200 (`LabOrder`):**

`LabOrder`; `status='sample_collected'`, `collectedAt`,
`collectedBy`, `specimenId`, `volumeMl` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Lab order bulunamadı.
- (409) — Yalnızca `ordered` numune alabilir.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-order.ts`
- Detay: `GET /api/v1/clinic/lab-orders/{id}`
- AI chunk: `flow-lab-order`
- Audit event: `audit:lab_order.collect`
