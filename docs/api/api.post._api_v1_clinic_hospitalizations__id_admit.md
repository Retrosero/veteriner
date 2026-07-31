# POST /api/v1/clinic/hospitalizations/{id}/admit

Yatışı kabul eder. `status='planned'` → `status='admitted'`.
`admittedAt` set edilir. Kafes atanır (varsa
`initialCageId` kullanılır).

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:admit`
- **Audit:** `audit:hospitalization.admit` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ cageId?: string,
admittedAt?: string }` — default now).

**Response 200 (`Hospitalization`):**

`Hospitalization`; `status='admitted'`, `admittedAt`,
`currentCageId` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Yatış veya cage bulunamadı.
- (409) — Yalnızca `planned` kabul edilir.
- (409) — Kafes dolu (`currentOccupancy >= capacity`).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Detay: `GET /api/v1/clinic/hospitalizations/{id}`
- AI chunk: `flow-hospitalization`
- Audit event: `audit:hospitalization.admit`
