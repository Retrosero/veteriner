# POST /api/v1/clinic/cages

Yeni kafes/kulübe oluşturur. `code` tenant-içi benzersiz.
`type`: `standard` | `isolation` | `intensive_care` |
`recovery` | `quarantine`.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:admit`
- **Audit:** `audit:cage.create` (info)

**Request body (`CageCreateInput`):**

```json
POST /api/v1/clinic/cages
{
  "code": "C-001",
  "name": "Kafes 1",
  "type": "standard",
  "capacity": 1,
  "notes": "Büyük köpekler için"
}
```

- `code` (string, 1-32, regex) zorunlu.
- `name` (string, 1-200) zorunlu.
- `type` (enum) zorunlu.
- `capacity` (integer, 1-10) zorunlu.
- `notes` opsiyonel.

**Response 201 (`Cage`):**

```json
{
  "id": "cage-uuid",
  "tenantId": "tnt-uuid",
  "code": "C-001",
  "name": "Kafes 1",
  "type": "standard",
  "capacity": 1,
  "active": true,
  "currentOccupancy": 0
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (409) — Duplicate `code`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Liste: `GET /api/v1/clinic/cages`
- Detay: `GET /api/v1/clinic/cages/{id}`
- Güncelle: `PATCH /api/v1/clinic/cages/{id}`
- Yatış: `POST /api/v1/clinic/hospitalizations`
- AI chunk: `flow-hospitalization`
- Audit event: `audit:cage.create`
