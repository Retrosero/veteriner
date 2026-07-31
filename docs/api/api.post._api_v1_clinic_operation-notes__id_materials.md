# POST /api/v1/clinic/operation-notes/{id}/materials

Operasyon notuna malzeme ekler. Sütür, implant, ilaç vb.
`productId` (Product.id) + `quantity` + opsiyonel `lotId`.

- **Modül:** operation-notes
- **Yetki:** `clinic:surgery:create`
- **Audit:** `audit:operation_note.material.add` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`OperationNoteMaterialInput`):**

```json
POST /api/v1/clinic/operation-notes/opn-uuid/materials
{
  "productId": "prd-uuid",
  "lotId": "lot-uuid",
  "quantity": "2",
  "notes": "Sütür 3-0"
}
```

- `productId` (string) zorunlu.
- `lotId` (string) opsiyonel.
- `quantity` (Decimal, >0) zorunlu.
- `notes` opsiyonel.

**Response 201 (`OperationNoteMaterial`):**

```json
{
  "id": "opnm-uuid",
  "operationNoteId": "opn-uuid",
  "productId": "prd-uuid",
  "lotId": "lot-uuid",
  "quantity": "2",
  "notes": "Sütür 3-0"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Not veya product bulunamadı.

**Stok entegrasyonu:** Faz 8 reaktif hook ile bu malzeme
kaydı `clinical_usage` (GOAL-066) `type='surgery'` olarak
stok düşümü tetikler.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/operation-note.ts`
- AI chunk: `flow-operation-note`
- Stok: `flow-clinical-usage` (GOAL-066)
- Audit event: `audit:operation_note.material.add`
