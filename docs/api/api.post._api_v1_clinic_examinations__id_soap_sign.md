# POST /api/v1/clinic/examinations/{id}/soap/sign

SOAP klinik kaydını imzalar. `status="draft"` → `signed`; `signedAt` +
`signedBy` set edilir. **Cross-service:** muayene de imzalanır
(`ExaminationsService.sign` çağrısı; muayene `status="completed"`
olmalı; aksi → 409 `VET-EXAM-0002` propagation). İmza sonrası SOAP
bölümleri **immutable** (append-only politika; UPDATE/DELETE trigger
FAZ-0'da no-op flag).

- **Modül:** soap
- **Yetki:** `clinic:examination:sign` (VETERINARIAN)
- **Audit:** `audit:soap.sign` (severity: info) — examinationId,
  signedAt, signedBy, previousStatus.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body:** Yok.

**Response 200 (`SoapNote`):**

```json
{
  "id": "soap-7a1b2c3d-9b1deb4d",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "status": "signed",
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "...",
  "signedAt": "2026-07-30T10:30:00.000Z",
  "signedBy": "usr-vet-uuid",
  "amendedAt": null,
  "createdAt": "2026-07-30T10:15:00.000Z",
  "createdBy": "usr-vet-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — SOAP notu / muayene bulunamadı /
  cross-tenant.
- `VET-SOAP-0001` (409) — SOAP `status="draft"` değil (signed
  / amended). details'te mevcut `status` döner.
- `VET-EXAM-0002` (409) — Muayene `status="completed"` değil
  (in_progress / amended / zaten signed). Cross-service propagation
  (ExaminationsService.sign).

**Durum makinesi (SOAP):**

```
draft → signed ✅
signed → signed ❌ (409 VET-SOAP-0001)
amended → signed ❌ (409 VET-SOAP-0001)
```

**Cross-service akış:**

1. Service `requireTenantScope` + repo `findByExamination(tenantId, id)`.
2. SOAP `status="draft"` guard; aksi → 409 `VET-SOAP-0001`.
3. **`ExaminationsService.sign(tenantId, examinationId, actor)`** —
   muayene de imzalanır. Muayene `status="completed"` değilse 409
   `VET-EXAM-0002` propagation (SOAP imzası yarım kalmaz; ya
   ikisi de imzalanır ya hiçbiri).
4. SOAP `status="signed"`, `signedAt=now`, `signedBy=actor.actorId`.
5. `logger.log({msg: "soap.signed.lock_immutable", ...})` — imza
   sonrası UPDATE/DELETE trigger'ı (FAZ-0 no-op flag; production
   migration'da DB trigger `signed → immutable`).
6. Audit `audit:soap.sign` (info).

**İş kuralları:**

- İmzacı `actor.actorId`'dir; cross-actor imza atılamaz.
- İmza sonrası doğrudan UPDATE/DELETE yasak; düzeltme yalnızca
  `POST .../amend` ile yeni `SoapAmendRecord` üzerinden (append-only).
- Düzeltme gerekçesi (`amend` body'sindeki `reason`) zorunludur;
  audit payload'ında düz metin olarak yer alır.

**Tenant izolasyonu:** `requireTenantScope` + repo +
`ExaminationsService.sign(tenantId, ...)` tümü `actor.tenantId`
kapsamında.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/soap.ts`
- SOAP oluştur: `POST /api/v1/clinic/examinations/{id}/soap`
- SOAP amend: `POST /api/v1/clinic/examinations/{id}/soap/amend`
- Muayene imzala: `POST /api/v1/clinic/examinations/{id}/sign`
- AI chunk: `flow-soap-note`
