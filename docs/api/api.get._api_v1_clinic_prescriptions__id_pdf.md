# GET /api/v1/clinic/prescriptions/{id}/pdf

Reçete PDF belgesi. **FAZ-0'da placeholder** — gerçek PDF render
yerine `text/plain` buffer döner (id, items, expiresAt, dispensed
bilgisi). Gerçek PDF render FAZ-10+'da. Cross-tenant → 404
`VET-CLINIC-0001` (bilgi sızdırmaz).

- **Modül:** prescriptions
- **Yetki:** `clinic:prescription:read` (STAFF / VETERINARIAN)
- **Audit:** `audit:prescription.pdf` (severity: info) — id.
- **Response Content-Type:** `text/plain; charset=utf-8`
- **Content-Disposition:** `attachment; filename="prescription-<id>.txt"`

**Path params:**

- `id` (string, zorunlu) — `prsc-<tenant8>-<uuid8>`.

**Response 200 (text/plain buffer, FAZ-0 placeholder):**

```
Prescription: prsc-7a1b2c3d-000001
Status: active
PrescribedAt: 2026-07-30T10:30:00.000Z
ExpiresAt: 2026-08-06T10:30:00.000Z

Items:
- Amoksisilin | 250 mg | twice_daily | 7 gün | oral
  Yemek sonrası. Allerji yok.
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Reçete bulunamadı / cross-tenant.

**İş kuralları:**

- `pdf(tenantId, id, actor)` tenant-scoped; cross-tenant → 404
  `VET-CLINIC-0001` (bilgi sızdırmaz).
- FAZ-0'da `text/plain` buffer döner; gerçek PDF render FAZ-10+'da
  (puppeteer/pdfkit + header/footer/logo + imza + watermark).
- Audit `audit:prescription.pdf` (info) — id; her pdf isteği
  denetim izine yazılır (klinik kayıt paylaşımı).
- `Content-Disposition: attachment` — tarayıcı dosyayı indirir;
  `filename="prescription-<id>.txt"` (FAZ-0 placeholder uzantısı;
  FAZ-10+'da `.pdf`).
- Append-only politika: PDF anlık reçete snapshot'udur; reçete
  üzerinde UPDATE/DELETE yok.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/prescription.ts`
- Reçete oluştur: `POST /api/v1/clinic/examinations/{id}/prescriptions`
- Reçete detayı: `GET /api/v1/clinic/prescriptions/{id}`
- AI chunk: `flow-prescription-dispense`
