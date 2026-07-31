# POST /api/v1/clinic/operation-notes/{id}/finalize

Operasyon notunu kapatır (kilitle). `status='draft'` →
`status='finalized'`. Finalize sonrası güncelleme reddedilir;
değişiklik `amend` ile olur.

- **Modül:** operation-notes
- **Yetki:** `clinic:surgery:complete` (yüksek yetki)
- **Audit:** `audit:operation_note.finalize` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`OperationNoteFinalizeInput`):**

```json
POST /api/v1/clinic/operation-notes/opn-uuid/finalize
{
  "summary": "Standart OVH, komplikasyon yok",
  "outcome": "successful"
}
```

- `summary` (string, 1-2000) zorunlu.
- `outcome` (enum: `successful|complicated|aborted`)
  zorunlu.

**Response 200 (`OperationNote`):**

`OperationNote`; `status='finalized'`, `finalizedAt`,
`finalizedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Not bulunamadı.
- (409) — Zaten `finalized` veya `amended`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/operation-note.ts`
- Amend: `POST /api/v1/clinic/operation-notes/{id}/amend`
- AI chunk: `flow-operation-note`
- Audit event: `audit:operation_note.finalize`
