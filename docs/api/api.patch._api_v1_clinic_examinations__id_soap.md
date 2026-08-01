# PATCH /api/v1/clinic/examinations/{id}/soap

SOAP klinik kaydını günceller (autosave / taslak düzeltme). Yalnızca
`status="draft"` SOAP güncellenebilir; signed/amended sonrası güncelleme
yapılamaz (immutable politika). Tüm alanlar opsiyoneldir; sadece
gönderilen alanlar değişir.

- **Modül:** soap
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:soap.update` (severity: info) — before/after
  S/O/A/P payload.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`SoapUpdateInput`):**

```json
{
  "objective": "Ateş 39.4°C, palpasyonda karın hassasiyeti.",
  "plan": "IV sıvı tedavisi + diyet önerisi; 24 saat sonra kontrol."
}
```

- `subjective` (string, max 20000, opsiyonel).
- `objective` (string, max 20000, opsiyonel).
- `assessment` (string, max 20000, opsiyonel).
- `plan` (string, max 20000, opsiyonel).

Gönderilmeyen alanlar değişmez. Tüm bölümleri yeniden yazmak için
4 bölümü de gönderin. Boş string `""` göndermek ilgili bölümü boşaltır
(dikkatli kullanın; imza sonrası güncelleme yasak).

**Response 200 (`SoapNote`):** güncellenmiş kayıt.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CLINIC-0001` (404) — SOAP notu bulunamadı / cross-tenant.
- `VET-SOAP-0001` (409) — SOAP `status="draft"` değil
  (signed / amended). details'te mevcut `status` döner.

**İş kuralları:**

- Yalnızca `status="draft"` güncellenebilir; signed veya amended
  SOAP'a PATCH → 409 `VET-SOAP-0001`. İmza sonrası düzeltme
  yalnızca `POST .../amend` (append-only) ile yapılır.
- Audit payload'ında `before` + `after` S/O/A/P tam metin olarak
  yer alır (klinik kayıt denetim izi).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`

- repo `findByExamination/update(tenantId, ...)` tümü
  `actor.tenantId` kapsamında.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/soap.ts`
- SOAP oluştur: `POST /api/v1/clinic/examinations/{id}/soap`
- SOAP imzala: `POST /api/v1/clinic/examinations/{id}/soap/sign`
- AI chunk: `flow-soap-note`
