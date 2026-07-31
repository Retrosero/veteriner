# POST /api/v1/clinic/anesthesia/{id}/staff

Anestezi takibine personel atar. `role`: `surgeon` |
`assistant_surgeon` | `anesthesiologist` | `nurse` |
`technician` | `observer`. Aynı kullanıcı farklı role
atanabilir.

- **Modül:** anesthesia
- **Yetki:** `clinic:anesthesia:create`
- **Audit:** `audit:anesthesia.staff.add` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`AnesthesiaStaffInput`):**

```json
POST /api/v1/clinic/anesthesia/an-uuid/staff
{
  "userId": "usr-uuid",
  "role": "anesthesiologist",
  "joinedAt": "2026-08-10T10:00:00.000Z",
  "leftAt": null,
  "notes": "Baş anestezist"
}
```

- `userId` (string) zorunlu.
- `role` (enum) zorunlu.
- `joinedAt` (ISO datetime) zorunlu.
- `leftAt` (ISO datetime) opsiyonel.
- `notes` opsiyonel.

**Response 201 (`AnesthesiaStaff`):**

```json
{
  "id": "ans-uuid",
  "anesthesiaId": "an-uuid",
  "userId": "usr-uuid",
  "role": "anesthesiologist",
  "joinedAt": "2026-08-10T10:00:00.000Z",
  "leftAt": null,
  "notes": "Baş anestezist"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Anestezi veya user bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/anesthesia.ts`
- AI chunk: `flow-anesthesia`
- Audit event: `audit:anesthesia.staff.add`
