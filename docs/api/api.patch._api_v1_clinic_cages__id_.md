# PATCH /api/v1/clinic/cages/{id}

Kafes kısmi güncelleme. Yalnız aktif kafesler
güncellenebilir; arşivli → 409.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:admit`
- **Audit:** `audit:cage.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`CageUpdateInput`):**

```json
PATCH /api/v1/clinic/cages/cage-uuid
{
  "name": "Kafes 1 (yeni)",
  "capacity": 2
}
```

- `name`, `type`, `capacity`, `notes`, `active`
  opsiyonel; en az bir alan.

**Response 200 (`Cage`):**

`Cage` şeması için bkz. `POST /api/v1/clinic/cages`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Kafes bulunamadı.
- (409) — Arşivlenmiş kafes güncellenemez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Detay: `GET /api/v1/clinic/cages/{id}`
- AI chunk: `flow-hospitalization`
- Audit event: `audit:cage.update`
