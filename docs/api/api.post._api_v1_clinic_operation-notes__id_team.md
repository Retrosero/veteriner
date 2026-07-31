# POST /api/v1/clinic/operation-notes/{id}/team

Operasyon notuna ekip üyesi ekler. `role`: `surgeon` |
`assistant_surgeon` | `nurse` | `anesthesiologist` |
`technician` | `observer`.

- **Modül:** operation-notes
- **Yetki:** `clinic:surgery:create`
- **Audit:** `audit:operation_note.team.add` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`OperationNoteTeamInput`):**

```json
POST /api/v1/clinic/operation-notes/opn-uuid/team
{
  "userId": "usr-uuid",
  "role": "surgeon",
  "joinedAt": "2026-08-10T10:00:00.000Z",
  "leftAt": "2026-08-10T11:30:00.000Z",
  "notes": "Baş cerrah"
}
```

- `userId` (string) zorunlu.
- `role` (enum) zorunlu.
- `joinedAt` (ISO datetime) zorunlu.
- `leftAt` (ISO datetime) opsiyonel.
- `notes` opsiyonel.

**Response 201 (`OperationNoteTeam`):**

```json
{
  "id": "opnt-uuid",
  "operationNoteId": "opn-uuid",
  "userId": "usr-uuid",
  "role": "surgeon",
  "joinedAt": "2026-08-10T10:00:00.000Z",
  "leftAt": "2026-08-10T11:30:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Not veya user bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/operation-note.ts`
- AI chunk: `flow-operation-note`
- Audit event: `audit:operation_note.team.add`
