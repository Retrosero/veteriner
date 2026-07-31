# GET /api/v1/clinic/operation-notes/{id}

ID'ye göre operasyon notu detayı (team + materials +
amendments alt kayıtları dahil). Cross-tenant → 404.

- **Modül:** operation-notes
- **Yetki:** `clinic:surgery:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`OperationNoteDetail`):**

`OperationNoteDetail`; team[] + materials[] + amendments[]
alt kayıtları dahil.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Not bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/operation-note.ts`
- Liste: `GET /api/v1/clinic/operation-notes`
- AI chunk: `flow-operation-note`
