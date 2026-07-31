# POST /api/v1/clinic/operation-notes/{id}/amend

Finalize edilmiş notu amendment ile düzeltir. Eski not
korunur; yeni amendment kaydı oluşturulur (append-only).
Ameliyat kaydı (tıbbi) için zorunlu.

- **Modül:** operation-notes
- **Yetki:** `clinic:surgery:amend` (yüksek yetki)
- **Audit:** `audit:operation_note.amend` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`OperationNoteAmendInput`):**

```json
POST /api/v1/clinic/operation-notes/opn-uuid/amend
{
  "findings": "Patoloji sonucu: benign kist",
  "complications": "Yok (güncelleme)",
  "amendReason": "Patoloji raporu eklendikten sonra güncelleme"
}
```

- `findings`, `technique`, `complications`, `estimatedBloodLoss`,
  `notes` opsiyonel; en az bir alan.
- `amendReason` (string, 1-2000) zorunlu.

**Response 201 (`OperationNoteAmend`):**

```json
{
  "id": "opna-uuid",
  "operationNoteId": "opn-uuid",
  "findings": "Patoloji sonucu: benign kist",
  "complications": "Yok (güncelleme)",
  "amendReason": "Patoloji raporu eklendikten sonra güncelleme",
  "amendedAt": "2026-08-15T10:00:00.000Z",
  "amendedBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Not bulunamadı.
- (409) — `finalized`/`amended` olmalı; `draft`
  amend edilemez.

**Append-only:** Eski not korunur; amendment ayrı kayıt
olarak `OperationNoteDetail.amendments[]`'e eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/operation-note.ts`
- Detay: `GET /api/v1/clinic/operation-notes/{id}`
- Aşı amendment: `flow-vaccine-application-amend` (GOAL-054)
- AI chunk: `flow-operation-note`
- Audit event: `audit:operation_note.amend`
