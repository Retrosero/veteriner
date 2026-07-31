# POST /api/v1/esmm/documents

Yeni e-SMM (e-Belge) belgesi taslağı oluşturur.
`documentType`: `invoice` (e-Fatura) | `dispatch` (e-İrsaliye)
| `receipt` (e-Makbuz). Pilot: sadece sözleşme; gerçek entegrasyon
Faz 13+ (GOAL-130).

- **Modül:** esmm
- **Yetki:** `audit:log:read` (Faz 7'de admin-only; Faz 13
  sonrası `esmm:document:create`)
- **Audit:** `audit:esmm.document.create` (info)

**Request body (`EsmmDocumentCreateInput`):**

```json
POST /api/v1/esmm/documents
{
  "documentType": "invoice",
  "sourceType": "clinic_sale",
  "sourceId": "cs-uuid",
  "customerTitle": "Ali Yılmaz",
  "customerTaxId": "1234567890",
  "customerTaxOffice": "Beşiktaş",
  "customerAddress": "İstanbul",
  "lines": [
    {
      "productId": "prd-uuid",
      "quantity": "1",
      "unitPrice": "200.00",
      "taxRate": "20"
    }
  ],
  "notes": "Pilot veri"
}
```

- `documentType` (enum) zorunlu.
- `sourceType` + `sourceId` (string) zorunlu.
- `customerTitle`, `customerTaxId`/`customerTaxOffice`,
  `customerAddress` opsiyonel.
- `lines[]` (min 1) zorunlu.
- `notes` opsiyonel.

**Response 201 (`EsmmDocument`):**

```json
{
  "id": "esmm-uuid",
  "tenantId": "tnt-uuid",
  "documentType": "invoice",
  "sourceType": "clinic_sale",
  "sourceId": "cs-uuid",
  "status": "draft",
  "totalAmount": "240.00",
  "taxTotal": "40.00",
  "currency": "TRY",
  "createdAt": "2026-07-30T17:00:00.000Z"
}
```

- `status`: `draft` | `pending` | `submitted` | `accepted` |
  `rejected` | `failed` | `cancelled`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Source bulunamadı.

**Tenant izolasyonu:** Tüm CRUD tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/esmm.ts`
- Liste: `GET /api/v1/esmm/documents`
- Detay: `GET /api/v1/esmm/documents/{id}`
- Gönder: `POST /api/v1/esmm/documents/{id}/submit`
- Yeniden dene: `POST /api/v1/esmm/documents/{id}/retry`
- İptal: `POST /api/v1/esmm/documents/{id}/cancel`
- AI chunk: `flow-esmm`
- Audit event: `audit:esmm.document.create`
