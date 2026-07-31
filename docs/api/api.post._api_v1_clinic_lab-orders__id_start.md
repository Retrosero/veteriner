# POST /api/v1/clinic/lab-orders/{id}/start

Testi başlatır. `status='sample_collected'` →
`'in_progress'`. `startedAt` set edilir. Cihaz adapter
(GOAL-094) ile otomatik cihaza gönderim.

- **Modül:** lab-orders
- **Yetki:** `clinic:lab:order`
- **Audit:** `audit:lab_order.start` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ startedAt?: string,
deviceId?: string }`).

**Response 200 (`LabOrder`):**

`LabOrder`; `status='in_progress'`, `startedAt`,
`startedBy`, opsiyonel `deviceId` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Lab order bulunamadı.
- (409) — Yalnızca `sample_collected` başlatılabilir.

**Cihaz entegrasyonu (Faz 14):** `deviceId` set edilirse
cihaz adapter üzerinden iş emri gönderilir (async). Pilot'ta
manuel.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-order.ts`
- Detay: `GET /api/v1/clinic/lab-orders/{id}`
- Cihaz adapter: `flow-lab-adapter` (GOAL-094)
- AI chunk: `flow-lab-order`
- Audit event: `audit:lab_order.start`
