# POST /api/v1/clinic/hospitalizations/{id}/cage-assignments

Yatış sırasında kafes ataması yapar. Admit sonrası
kafes değişimi (transfer) veya boş kafese yeni atama.
Aynı anda 1 aktif assignment; `end` edilmeden yeni
atanamaz.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:admit`
- **Audit:** `audit:cage_assignment.create` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu — yatış id.

**Request body (`CageAssignmentCreateInput`):**

```json
POST /api/v1/clinic/hospitalizations/hosp-uuid/cage-assignments
{
  "cageId": "cage-uuid",
  "startedAt": "2026-07-30T14:00:00.000Z",
  "notes": "Transfer — izolasyon ihtiyacı"
}
```

- `cageId` (string) zorunlu.
- `startedAt` (ISO datetime) opsiyonel, default `now`.
- `notes` opsiyonel.

**Response 201 (`CageAssignment`):**

```json
{
  "id": "cas-uuid",
  "hospitalizationId": "hosp-uuid",
  "cageId": "cage-uuid",
  "startedAt": "2026-07-30T14:00:00.000Z",
  "endedAt": null,
  "notes": "Transfer — izolasyon ihtiyacı"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Yatış veya cage bulunamadı.
- (409) — Aktif assignment zaten var (önce `end`).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Bitir: `POST /api/v1/clinic/hospitalizations/cage-assignments/{assignmentId}/end`
- AI chunk: `flow-hospitalization`
- Audit event: `audit:cage_assignment.create`
