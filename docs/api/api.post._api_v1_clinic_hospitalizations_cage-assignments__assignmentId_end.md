# POST /api/v1/clinic/hospitalizations/cage-assignments/{assignmentId}/end

Kafes atamasını sonlandırır. `endedAt` set edilir;
kafes boşaltılır. Yeni assignment oluşturulabilir.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:admit`
- **Audit:** `audit:cage_assignment.end` (info)

**Path parametreleri:**

- `assignmentId` (UUID) zorunlu.

**Request body:** opsiyonel (`{ endedAt?: string,
reason?: string }`).

**Response 200 (`CageAssignment`):**

`CageAssignment`; `endedAt` set edilir; kafes
`currentOccupancy--`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Assignment bulunamadı (cross-tenant dahil).
- (409) — Zaten `endedAt != null`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Oluştur: `POST /api/v1/clinic/hospitalizations/{id}/cage-assignments`
- AI chunk: `flow-hospitalization`
- Audit event: `audit:cage_assignment.end`
