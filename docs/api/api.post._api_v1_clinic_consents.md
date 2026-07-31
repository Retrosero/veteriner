# POST /api/v1/clinic/consents

Yeni onam formu taslağı oluşturur. Şablon (template) +
versiyon + hasta + sahip + opsiyonel source (surgery_plan/
lab_order vb.) bağlanır. `status='draft'`.

- **Modül:** consents
- **Yetki:** `clinic:consent:sign`
- **Audit:** `audit:consent.create` (info)

**Request body (`ConsentCreateInput`):**

```json
POST /api/v1/clinic/consents
{
  "templateId": "ct-surgery-general",
  "templateVersion": "1.0",
  "patientId": "pat-uuid",
  "ownerId": "own-uuid",
  "sourceType": "surgery_plan",
  "sourceId": "sp-uuid",
  "locale": "tr-TR"
}
```

- `templateId` (string) zorunlu.
- `templateVersion` (string) zorunlu.
- `patientId` (string) zorunlu.
- `ownerId` (string) zorunlu.
- `sourceType` (enum: `surgery_plan|lab_order|procedure|
  other`) opsiyonel.
- `sourceId` (string) opsiyonel — `sourceType` set ise.
- `locale` (ISO) opsiyonel, default `tr-TR`.

**Response 201 (`Consent`):**

```json
{
  "id": "con-uuid",
  "tenantId": "tnt-uuid",
  "templateId": "ct-surgery-general",
  "templateVersion": "1.0",
  "patientId": "pat-uuid",
  "ownerId": "own-uuid",
  "sourceType": "surgery_plan",
  "sourceId": "sp-uuid",
  "status": "draft",
  "locale": "tr-TR",
  "createdAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.

**Tenant izolasyonu:** Tüm CRUD tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/consent.ts`
- Liste: `GET /api/v1/clinic/consents`
- Detay: `GET /api/v1/clinic/consents/{id}`
- İmzala: `POST /api/v1/clinic/consents/{id}/sign`
- Geri çek: `POST /api/v1/clinic/consents/{id}/revoke`
- AI chunk: `flow-consent`
- Audit event: `audit:consent.create`
