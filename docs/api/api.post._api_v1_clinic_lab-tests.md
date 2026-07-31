# POST /api/v1/clinic/lab-tests

Yeni laboratuvar test kataloğu. `code` tenant-içi
benzersiz. `specimenType`: `blood` | `urine` | `feces` |
`swab` | `tissue` | `other`. `category`: `hematology` |
`biochemistry` | `microbiology` | `parasitology` |
`urinalysis` | `cytology` | `imaging` | `other`.

- **Modül:** lab-tests
- **Yetki:** `clinic:lab:order`
- **Audit:** `audit:lab_test.create` (info)

**Request body (`LabTestCreateInput`):**

```json
POST /api/v1/clinic/lab-tests
{
  "code": "CBC",
  "name": "Tam kan sayımı",
  "category": "hematology",
  "specimenType": "blood",
  "specimenVolumeMl": "2",
  "tatHours": 4,
  "referenceRanges": [
    { "analyte": "WBC", "unit": "10^3/µL", "low": "6", "high": "17" },
    { "analyte": "RBC", "unit": "10^6/µL", "low": "5.5", "high": "8.5" }
  ],
  "price": "120.00",
  "currency": "TRY"
}
```

- `code` (string, regex) zorunlu.
- `name` (string, 1-200) zorunlu.
- `category` (enum) zorunlu.
- `specimenType` (enum) zorunlu.
- `specimenVolumeMl` (string) opsiyonel.
- `tatHours` (integer) opsiyonel.
- `referenceRanges[]` opsiyonel — analyte + unit + low + high.
- `price` (Decimal) opsiyonel.
- `currency` (ISO 4217) opsiyonel.

**Response 201 (`LabTest`):**

```json
{
  "id": "lt-uuid",
  "tenantId": "tnt-uuid",
  "code": "CBC",
  "name": "Tam kan sayımı",
  "category": "hematology",
  "specimenType": "blood",
  "tatHours": 4,
  "price": "120.00",
  "currency": "TRY",
  "active": true,
  "createdAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (409) — Duplicate `code`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-test.ts`
- Liste: `GET /api/v1/clinic/lab-tests`
- Detay: `GET /api/v1/clinic/lab-tests/{id}`
- Güncelle: `PATCH /api/v1/clinic/lab-tests/{id}`
- İstek: `flow-lab-order` (GOAL-091)
- AI chunk: `flow-lab-test`
- Audit event: `audit:lab_test.create`
