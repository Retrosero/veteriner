# PATCH /api/v1/clinic/hospitalizations/{id}

Yatış kaydı kısmi güncelleme. Yalnız `status='planned'`
güncellenebilir (409). Admit/discharge ayrı endpoint.

- **Modül:** hospitalization
- **Yetki:** `clinic:hospitalization:admit`
- **Audit:** `audit:hospitalization.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`HospitalizationUpdateInput`):**

```json
PATCH /api/v1/clinic/hospitalizations/hosp-uuid
{
  "expectedDuration": "72",
  "notes": "Planlanan tahmini güncellendi"
}
```

- `reason`, `expectedDuration`, `initialCageId`, `notes`
  opsiyonel; en az bir alan.

**Response 200 (`Hospitalization`):**

`Hospitalization` şeması için bkz.
`POST /api/v1/clinic/hospitalizations`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Yatış bulunamadı.
- (409) — Yalnızca `planned` güncellenebilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Detay: `GET /api/v1/clinic/hospitalizations/{id}`
- AI chunk: `flow-hospitalization`
- Audit event: `audit:hospitalization.update`
