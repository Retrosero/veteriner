# POST /api/v1/clinic/surgery-plans/{id}/start

Ameliyatı başlatır. `status='planned'` → `status='in_progress'`.
`actualStart` set edilir. Anestezi akışı (GOAL-082) ve
operasyon notu (GOAL-083) bu noktada bağlanır.

- **Modül:** surgery-plans
- **Yetki:** `clinic:surgery:start`
- **Audit:** `audit:surgery_plan.start` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ anesthesiaStartId?: string }`
— GOAL-082 anestezi takibi başlangıç id).

**Response 200 (`SurgeryPlan`):**

`SurgeryPlan`; `status='in_progress'`, `actualStart`,
`startedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- (404) — Plan bulunamadı.
- (409) — Yalnızca `planned` başlatılabilir.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Onam zorunlu:** Başlatmadan önce `consent` (GOAL-081)
imzalanmış olmalı. Yoksa 409.

**Audit detayı:** `previousStatus` + `anesthesiaStartId?`
payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/surgery-plan.ts`
- Anestezi: `flow-anesthesia` (GOAL-082)
- Onam: `flow-consent` (GOAL-081)
- AI chunk: `flow-surgery-plan`
- Audit event: `audit:surgery_plan.start`
