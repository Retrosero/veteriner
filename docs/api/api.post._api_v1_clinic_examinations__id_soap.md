# POST /api/v1/clinic/examinations/{id}/soap

Muayeneye bağlı yeni SOAP (Subjective / Objective / Assessment / Plan)
klinik kaydı oluşturur. Her bölüm (S/O/A/P) opsiyoneldir (draft
aşamasında boş olabilir; autosave sonrası update ile doldurulur).
`status="draft"` insert.

- **Modül:** soap
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:soap.create` (severity: info) — examinationId,
  status.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`SoapUpdateInput`):**

```json
{
  "subjective": "Sahibi 3 gündür iştahsız ve halsiz olduğunu bildiriyor.",
  "objective": "Ateş 39.4°C, palpasyonda karın hassasiyeti.",
  "assessment": "Gastroenterit, hafif dehidrasyon.",
  "plan": "IV sıvı tedavisi + diyet önerisi; 24 saat sonra kontrol."
}
```

- `subjective` (string, max 20000, opsiyonel) — hastanın/subjektif
  bildirimi.
- `objective` (string, max 20000, opsiyonel) — muayene bulguları,
  ölçümler.
- `assessment` (string, max 20000, opsiyonel) — tanı / klinik
  değerlendirme.
- `plan` (string, max 20000, opsiyonel) — tedavi / izlem planı.

**Response 201 (`SoapNote`):**

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

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CLINIC-0001` (404) — Muayene bulunamadı / cross-tenant.
- `VET-SOAP-0001` (409) — Examination `status="in_progress"` değil
  (completed / signed / amended). details'te `examStatus` döner.

**İş kuralları:**

- Examination aynı tenant'ta olmalı
  (`ExaminationsService.findById(tenantId, id, actor)`); cross-tenant
  → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
- Examination `status="in_progress"` olmalı; aksi 409
  `VET-SOAP-0001`. Yani SOAP, muayene henüz tamamlanmadan oluşturulur.
- `id` client tarafından set edilmez; service
  `soap-<tenant8>-<uuid8>` üretir.
- Opsiyonel bölümler boş bırakılırsa `""` olarak saklanır (PII /
  hassas klinik içerik PII maskeleme audit/log katmanında yapılır).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/soap.ts`
- SOAP güncelle: `PATCH /api/v1/clinic/examinations/{id}/soap`
- SOAP imzala: `POST /api/v1/clinic/examinations/{id}/soap/sign`
- AI chunk: `flow-soap-note`
