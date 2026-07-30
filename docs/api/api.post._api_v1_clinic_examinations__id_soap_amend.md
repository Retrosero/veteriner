# POST /api/v1/clinic/examinations/{id}/soap/amend

İmza atılmış bir SOAP kaydını düzeltmek için yeni `SoapAmendRecord`
oluşturur (**append-only**). Orijinal S/O/A/P bölümleri korunur;
yeni içerik amend kaydında snapshot olarak saklanır. SOAP
`status="amended"` yapılır; önceki imza zamanı/imzacısı
amendment kaydında immutable referans olarak saklanır.

- **Modül:** soap
- **Yetki:** `clinic:examination:sign` (VETERINARIAN)
- **Audit:** `audit:soap.amend` (severity: **warning**) — amendId,
  reason, previousStatus, previousSignedAt, previousSignedBy.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`SoapAmendInput`):**

```json
{
  "reason": "Teşhis güncellemesi: laboratuvar sonucu eklendi.",
  "subjective": "...",
  "objective": "...",
  "assessment": "Gastroenterit + paraziter enfeksiyon; CBC/lipaz yüksek.",
  "plan": "IV sıvı + antiparaziter + diyet; 48 saat sonra kontrol."
}
```

- `reason` (string, 1-2000 karakter, zorunlu) — düzeltme gerekçesi
  (klinik + hukuki denetim için zorunlu).
- `subjective` (string, max 20000, zorunlu).
- `objective` (string, max 20000, zorunlu).
- `assessment` (string, max 20000, zorunlu).
- `plan` (string, max 20000, zorunlu).

Not: Create / update'ten farklı olarak amend'te 4 bölümün tamamı
**zorunludur** (imzalı kayıt üzerinde düzeltme yapıldığı için eksik
bölüm kabul edilmez).

**Response 200:**

```json
{
  "soap": {
    "id": "soap-7a1b2c3d-9b1deb4d",
    "examinationId": "exam-7a1b2c3d-9b1deb4d",
    "status": "amended",
    "subjective": "...",
    "objective": "...",
    "assessment": "...",
    "plan": "...",
    "signedAt": "2026-07-30T10:30:00.000Z",
    "signedBy": "usr-vet-uuid",
    "amendedAt": "2026-07-30T11:00:00.000Z",
    "createdAt": "2026-07-30T10:15:00.000Z",
    "createdBy": "usr-vet-uuid"
  },
  "amend": {
    "id": "soap-amend-7a1b2c3d-cafebabe",
    "tenantId": "tnt-uuid",
    "originalSoapId": "soap-7a1b2c3d-9b1deb4d",
    "examinationId": "exam-7a1b2c3d-9b1deb4d",
    "reason": "Teşhis güncellemesi: laboratuvar sonucu eklendi.",
    "subjective": "...",
    "objective": "...",
    "assessment": "Gastroenterit + paraziter enfeksiyon; CBC/lipaz yüksek.",
    "plan": "IV sıvı + antiparaziter + diyet; 48 saat sonra kontrol.",
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
- `VET-CLINIC-0001` (404) — SOAP notu / muayene bulunamadı /
  cross-tenant.
- `VET-SOAP-0001` (409) — SOAP `status="signed"` değil
  (draft / amended). details'te mevcut `status` döner.

**İş kuralları:**

- Yalnızca `status="signed"` SOAP amend edilebilir; draft iken
  amend → 409 `VET-SOAP-0001` (draft için `PATCH` kullanın).
- **Append-only:** `SoapNote` kaydının orijinal S/O/A/P bölümleri
  değiştirilmez; yeni içerik `SoapAmendRecord`'da saklanır.
  `SoapNote.status="amended"` + `amendedAt=now` set edilir.
- `previousSignedAt` + `previousSignedBy` amend kaydında immutable
  referans olarak kopyalanır; audit trail kaybı olmaz.
- Düzeltme gerekçesi (`reason`) zorunlu; audit payload'ında düz
  metin olarak yer alır.
- Birden fazla amend zincirlenebilir (multi-amend); her biri ayrı
  `SoapAmendRecord` + audit warning. Orijinal S/O/A/P hâlâ
  değiştirilemez.
- Amend sonrası doğrudan `PATCH` ile SOAP güncellenemez
  (status="amended" → 409 `VET-SOAP-0001`); yeni düzeltme yine
  amend yoluyla yapılır.

**Tenant izolasyonu:** `requireTenantScope` + repo + amends tümü
`actor.tenantId` kapsamında; cross-tenant amendment denemesi → 404
`VET-CLINIC-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/soap.ts`
- SOAP imzala: `POST /api/v1/clinic/examinations/{id}/soap/sign`
- Muayene amend: `POST /api/v1/clinic/examinations/{id}/amend`
- AI chunk: `flow-soap-note`
