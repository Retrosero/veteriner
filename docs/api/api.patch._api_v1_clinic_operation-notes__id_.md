# PATCH /api/v1/clinic/operation-notes/{id}

Operasyon notu kısmi güncelleme. Yalnız `status='draft'`
güncellenebilir (409).

- **Modül:** operation-notes
- **Yetki:** `clinic:surgery:create`
- **Audit:** `audit:operation_note.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`OperationNoteUpdateInput`):**

```json
PATCH /api/v1/clinic/operation-notes/opn-uuid
{
  "findings": "Uterus ve overler normal (güncellendi)",
  "complications": "Minör kanama",
  "notes": "Kompresyon ile kontrol"
}
```

- `procedureName`, `findings`, `technique`, `complications`,
  `estimatedBloodLoss`, `notes` opsiyonel; en az bir alan.

**Response 200 (`OperationNote`):**

`OperationNote` şeması için bkz.
`POST /api/v1/clinic/operation-notes`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Not bulunamadı.
- (409) — Yalnızca `draft` güncellenebilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/operation-note.ts`
- Detay: `GET /api/v1/clinic/operation-notes/{id}`
- Amend: `POST /api/v1/clinic/operation-notes/{id}/amend`
- AI chunk: `flow-operation-note`
- Audit event: `audit:operation_note.update`
