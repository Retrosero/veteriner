# PATCH /api/v1/clinic/lab-tests/{id}

Test kataloğu kısmi güncelleme. Aktif order'lar
etkilenmez; yeni order'lar güncel hali görür.

- **Modül:** lab-tests
- **Yetki:** `clinic:lab:order`
- **Audit:** `audit:lab_test.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`LabTestUpdateInput`):**

```json
PATCH /api/v1/clinic/lab-tests/lt-uuid
{
  "price": "150.00",
  "tatHours": 6
}
```

- `name`, `category`, `specimenType`, `specimenVolumeMl`,
  `tatHours`, `referenceRanges[]`, `price`, `currency`,
  `active` opsiyonel; en az bir alan.

**Response 200 (`LabTest`):**

`LabTest` şeması için bkz. `POST /api/v1/clinic/lab-tests`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Test bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-test.ts`
- Detay: `GET /api/v1/clinic/lab-tests/{id}`
- AI chunk: `flow-lab-test`
- Audit event: `audit:lab_test.update`
