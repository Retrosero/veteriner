# POST /api/v1/clinic/examinations/{id}/amend

İmza atılmış bir muayenede düzeltme için yeni `ExaminationAmend`
kaydı oluşturur (append-only). Muayene status `amended` yapılır;
önceki imza zamanı/imzacısı amendment kaydında saklanır.

- **Modül:** examinations
- **Yetki:** `clinic:examination:amend` (VETERINARIAN)
- **Audit:** `audit:examination.amend` (severity: **warning**) —
  amendId, reason, previousStatus, previousSignedAt,
  previousSignedBy.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`ExaminationAmendInput`):**

```json
{
  "reason": "Teşhis güncellemesi: laboratuvar sonucu eklendi."
}
```

- `reason` (string, 1-2000 karakter, zorunlu) — düzeltme gerekçesi
  (klinik + hukuki denetim için zorunlu).

**Response 200:**

```json
{
  "examination": {
    "id": "exam-7a1b2c3d-9b1deb4d",
    "status": "amended",
    "updatedAt": "2026-07-30T11:00:00.000Z"
  },
  "amend": {
    "id": "exam-amend-7a1b2c3d-cafebabe",
    "tenantId": "tnt-uuid",
    "examinationId": "exam-7a1b2c3d-9b1deb4d",
    "reason": "Teşhis güncellemesi: laboratuvar sonucu eklendi.",
    "amendedBy": "usr-vet-uuid",
    "amendedAt": "2026-07-30T11:00:00.000Z",
    "previousSignedAt": "2026-07-30T10:30:00.000Z",
    "previousSignedBy": "usr-vet-uuid"
  }
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CLINIC-0001` (404) — Muayene bulunamadı / cross-tenant.

**İş kuralları:**

- Amendment **append-only**: önceki muayene kaydı değiştirilmez;
  yeni `ExaminationAmend` kaydı + muayene `status=amended`.
- `previousSignedAt` / `previousSignedBy` amendment kaydında
  immutable referans olarak saklanır; audit trail kaybı olmaz.
- Düzeltme gerekçesi (`reason`) zorunludur; audit payload'ında
  düz metin olarak yer alır.
- Bir muayene için birden fazla amendment zincirlenebilir
  (multi-amend); her biri ayrı kayıt + audit warning.

**Tenant izolasyonu:** `repo.findById/update` + `amends.insert` +
`listAmends` tümü actor.tenantId kapsamında çalışır.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/examination.ts`
- İmzala: `POST /api/v1/clinic/examinations/{id}/sign`
- AI chunk: `flow-examination-sign`
