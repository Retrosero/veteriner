# POST /api/v1/clinic/operation-notes

Yeni operasyon notu. Plan `in_progress` olmalı (422
VET-OPNOTE-0003). Aynı plan için ikinci not reddedilir
(409 VET-OPNOTE-0004). `status='draft'`.

- **Modül:** operation-notes
- **Yetki:** `clinic:surgery:create`
- **Audit:** `audit:operation_note.create` (info)

**Request body (`OperationNoteCreateInput`):**

```json
POST /api/v1/clinic/operation-notes
{
  "surgeryPlanId": "sp-uuid",
  "patientId": "pat-uuid",
  "procedureName": "Kısırlaştırma (OVH)",
  "findings": "Uterus ve overler normal",
  "technique": "Median insizyon, OVH standart teknik",
  "complications": "Yok",
  "estimatedBloodLoss": "20",
  "notes": "Stabil uyandı"
}
```

- `surgeryPlanId` (string) zorunlu.
- `patientId` (string) zorunlu.
- `procedureName` (string) zorunlu.
- `findings`, `technique`, `complications` opsiyonel.
- `estimatedBloodLoss` (string, ml) opsiyonel.
- `notes` opsiyonel.

**Response 201 (`OperationNote`):**

```json
{
  "id": "opn-uuid",
  "tenantId": "tnt-uuid",
  "surgeryPlanId": "sp-uuid",
  "patientId": "pat-uuid",
  "procedureName": "Kısırlaştırma (OVH)",
  "status": "draft",
  "createdAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Plan/patient bulunamadı.
- `VET-OPNOTE-0003` (422) — Plan `in_progress` değil.
- `VET-OPNOTE-0004` (409) — Aynı plan için ikinci not.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/operation-note.ts`
- Liste: `GET /api/v1/clinic/operation-notes`
- Detay: `GET /api/v1/clinic/operation-notes/{id}`
- Güncelle: `PATCH /api/v1/clinic/operation-notes/{id}`
- Ekip: `POST /api/v1/clinic/operation-notes/{id}/team`
- Malzemeler: `POST /api/v1/clinic/operation-notes/{id}/materials`
- Finalize: `POST /api/v1/clinic/operation-notes/{id}/finalize`
- Amend: `POST /api/v1/clinic/operation-notes/{id}/amend`
- Ameliyat: `flow-surgery-plan` (GOAL-080)
- AI chunk: `flow-operation-note`
- Audit event: `audit:operation_note.create`
