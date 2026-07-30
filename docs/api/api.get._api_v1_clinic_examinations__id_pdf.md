# GET /api/v1/clinic/examinations/{id}/pdf

Muayeneye ait birleşik klinik kayıt PDF belgesi. **FAZ-0'da
placeholder** — gerçek PDF render yerine `text/plain` buffer döner
(Examination + SOAP + Vitals + Diagnoses + Prescriptions + Orders +
Followups bölümleri). Gerçek PDF (header/footer/logo + imza +
watermark) FAZ-10+'da `pdfkit`/`puppeteer` ile. Cross-tenant → 404
`VET-CLINIC-0001` (bilgi sızdırmaz).

- **Modül:** clinical-records
- **Yetki:** `clinic:examination:read` (STAFF / VETERINARIAN)
- **Audit:** `audit:clinical-record.generate` (severity: info) —
  examinationId, patientId, veterinarianId, format, sizeBytes, sections.
- **Response Content-Type:** `text/plain; charset=utf-8`
- **Content-Disposition:** `attachment; filename="clinical-record-<id>.txt"`
- **Ek header'lar:** `X-Document-Id`, `X-Generated-At`.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Response 200 (text/plain buffer, FAZ-0 placeholder):**

```
=== VETNIVA KLINIK KAYIT ===
Document: crpdf-7a1b2c3d-000001
Generated: 2026-07-30T12:00:00.000Z
Tenant: tnt-uuid

-- Examination --
ID: exam-7a1b2c3d-9b1deb4d
Patient: 33333333-3333-3333-333333333333
Veterinarian: usr-vet-uuid
Type: general
Status: completed
Chief Complaint: Öksürük ve halsizlik
Started: 2026-07-30T10:00:00.000Z
Completed: 2026-07-30T10:25:00.000Z
Signed: 2026-07-30T10:30:00.000Z

-- SOAP --
S: 3 gündür öksürük, iştahsızlık
O: ...
A: Üst solunum yolu enfeksiyonu şüphesi
P: Amoksisilin 250 mg 7 gün; 1 hafta sonra kontrol
...
(Placeholder PDF — gerçek render FAZ-10+'da)
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Examination bulunamadı / cross-tenant.

**İş kuralları:**

- `generatePdf(tenantId, examinationId, actor)` tenant-scoped;
  cross-tenant → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
- Alt kayıtlar `Promise.all` ile paralel çekilir: SOAP, Vitals,
  Diagnoses, Prescriptions (patientId), Orders (patientId),
  Followups (patientId, scheduled). Hepsi tenant-scoped.
- FAZ-0'da `text/plain` buffer döner; gerçek PDF render FAZ-10+'da
  (`pdfkit` veya `puppeteer` + tenant header/footer/logo +
  veteriner imza alanı + `confidential` watermark).
- Audit `audit:clinical-record.generate` (info) — her pdf isteği
  denetim izine yazılır (klinik kayıt paylaşımı / indirme takibi).
- `Content-Disposition: attachment` — tarayıcı dosyayı indirir;
  `filename="clinical-record-<id>.txt"` (FAZ-0 placeholder uzantısı;
  FAZ-10+'da `.pdf`).
- Append-only politika: PDF anlık muayene snapshot'udur; muayene
  üzerinde UPDATE/DELETE yok, düzeltme amendment/ters kayıt ile.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinical-record-share.ts`
- Paylaşım: `POST /api/v1/clinic/examinations/{id}/share`
- Paylaşım listesi: `GET /api/v1/clinic/examinations/{id}/shares`
- Paylaşım iptal: `DELETE /api/v1/clinic/shares/{shareId}`
- AI chunk: `clinical-record-share`
