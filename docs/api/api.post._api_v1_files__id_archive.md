# POST /api/v1/files/:id/archive

Dosyayı arşivler (soft delete). Storage'da arşiv klasörüne taşınır;
DB'de `archivedAt` + `archivedBy` + `archiveReason` set edilir.
**Fiziksel silme YOK**.

- **Modül:** file
- **Yetki:** `file:file:delete`
- **Idempotent:** Hayır — zaten arşivli ise 409 (`VET-FILE-0005`).
- **Audit:** `audit:file.archive` (warning)

**Path parametreleri:**

- `id` (UUID, zorunlu)

**Request body:**

```json
{ "reason": "KVKK silme talebi" }
```

- `reason` — Zorunlu, max 500 karakter.

**Response 200:** `FileMeta` (archived).

**Hata kodları:**

- `VET-AUTH-0001` (401), `VET-AUTHZ-0001` (403)
- `VET-FILE-0001` (404) — dosya bulunamadı
- `VET-FILE-0005` (409) — zaten arşivlenmiş
