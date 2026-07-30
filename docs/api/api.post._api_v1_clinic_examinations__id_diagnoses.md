# POST /api/v1/clinic/examinations/{id}/diagnoses

Muayeneye bağlı yeni teşhis kaydı ekler. `patientId` muayeneden
türetilir; client gönderemez. Yeni teşhis `status='active'` olarak
başlatılır; yaşam döngüsü state machine ile yönetilir (`active` →
`{resolved, chronic, ruled_out}`).

- **Modül:** diagnoses
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:diagnosis.create` (severity: info) —
  examinationId, patientId, category, status, code.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`DiagnosisCreateInput`):**

```json
{
  "name": "Kronik böbrek yetmezliği",
  "category": "primary",
  "code": "N18.9",
  "notes": "IRIS stage 2; 6 aydır progressif seyir."
}
```

- `name` (string, 1-500, zorunlu) — Teşhis adı.
- `category` (enum, zorunlu) — `primary` | `secondary` |
  `differential` | `rule_out`.
- `code` (string, 1-50, opsiyonel) — ICD-10 vet kodu (FAZ-4'te
  opsiyonel, ileride zorunlu olabilir).
- `notes` (string, max 2000, opsiyonel) — Serbest klinik not.

**Response 201 (`Diagnosis`):**

```json
{
  "id": "diagnosis-7a1b2c3d-000001",
  "tenantId": "tnt-uuid",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "patientId": "33333333-3333-3333-333333333333",
  "code": "N18.9",
  "name": "Kronik böbrek yetmezliği",
  "category": "primary",
  "status": "active",
  "notes": "IRIS stage 2; 6 aydır progressif seyir.",
  "createdAt": "2026-07-30T10:30:00.000Z",
  "createdBy": "usr-vet-uuid",
  "resolvedAt": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Body parse hatası (enum,
  range, `.strict()`).
- `VET-CLINIC-0001` (404) — Muayene bulunamadı / cross-tenant.

**İş kuralları:**

- Examination `ExaminationsService.findById(tenantId, id, actor)`
  ile aynı tenant'ta mı doğrulanır; cross-tenant → 404
  `VET-CLINIC-0001` (bilgi sızdırmaz).
- Zod şema `.strict()` — bilinmeyen alan reddedilir (422
  `VET-VALIDATION-0001`).
- `patientId` muayeneden türetilir; client gönderemez (tutarlılık
  garantisi). `id` client tarafından set edilmez; service
  `diagnosis-<tenant8>-000001` (artan sayaç, tenant başına) üretir.
- Yeni teşhis her zaman `status='active'` olarak başlatılır;
  diğer state'lere geçiş `resolve` / `setChronic` / `setRuledOut`
  endpoint'leri ile yapılır.
- `category` semantiği: `primary` ana teşhis, `secondary` ek
  teşhis, `differential` ayırıcı tanı, `rule_out` dışlama için
  işaretlenen aday. `differential` kategorili teşhis `ruled_out`
  ile elenebilir (FAZ-4 istisnası).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi
→ 403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/diagnosis.ts`
- Muayene teşhis listesi: `GET /api/v1/clinic/examinations/{id}/diagnoses`
- Hasta teşhis listesi: `GET /api/v1/clinic/patients/{id}/diagnoses`
- AI chunk: `flow-diagnosis`
