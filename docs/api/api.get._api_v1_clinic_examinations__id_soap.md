# GET /api/v1/clinic/examinations/{id}/soap

Examination'a bağlı SOAP klinik kaydını getirir. Bir muayeneye en
fazla bir SOAP kaydı bağlanır; yoksa 404 `VET-CLINIC-0001`.

- **Modül:** soap
- **Yetki:** `clinic:examination:read` (STAFF / VETERINARIAN)
- **Audit:** Okuma işlemi audit üretmez (listeleme).

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Response 200 (`SoapNote`):**

```json
{
  "id": "soap-7a1b2c3d-9b1deb4d",
  "tenantId": "tnt-uuid",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "subjective": "Sahibi 3 gündür iştahsız ve halsiz olduğunu bildiriyor.",
  "objective": "Ateş 39.4°C, palpasyonda karın hassasiyeti.",
  "assessment": "Gastroenterit, hafif dehidrasyon.",
  "plan": "IV sıvı tedavisi + diyet önerisi; 24 saat sonra kontrol.",
  "status": "draft",
  "createdAt": "2026-07-30T10:15:00.000Z",
  "createdBy": "usr-vet-uuid",
  "signedAt": null,
  "signedBy": null,
  "amendedAt": null
}
```

İmzalı / düzeltilmiş SOAP'larda `signedAt`, `signedBy`, `amendedAt`
alanları set edilir; örn. `status="amended"` durumunda bile orijinal
S/O/A/P bölümleri döner (değiştirilemez; append-only politika).
Düzeltme geçmişi için ayrıca amendment kayıtları tutulur (ileride
`GET .../amends` endpoint'i ile).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — SOAP notu bulunamadı / cross-tenant
  examination.

**İş kuralları:**

- `findByExamination(tenantId, examinationId, actor)` tenant-scoped
  çalışır; cross-tenant → `null` (controller 404
  `VET-CLINIC-0001`'e map eder; bilgi sızdırmaz).
- Bir examination için en fazla 1 SOAP kaydı kabul edilir; tekrar
  create → 409 `VET-SOAP-0001` (state guard: exam
  `status=in_progress` ise zaten create yolu açık; signed/amended
  exam için create kapalı).

**Tenant izolasyonu:** Repository `findByExamination(tenantId,
examinationId)` yalnızca `actor.tenantId` kapsamında arar.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/soap.ts`
- SOAP oluştur: `POST /api/v1/clinic/examinations/{id}/soap`
- AI chunk: `flow-soap-note`
