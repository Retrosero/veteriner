# GOAL-125 — Tenant Veri Dışa Aktarma (Completion Report)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Özet

Yetkili tenant yöneticisinin müşteri, hayvan, klinik
kayıt, finans ve dosya verilerini güvenli dışa
aktarabilmesi. Asenkron çalışır; signed URL ile 24 saat
geçerli indirme bağlantısı sunar; tüm aksiyonlar audit
üretir.

## Çıktılar

### Döküman (bu commit)

- `docs/security/TENANT_DATA_EXPORT.md` — endpoint'ler
  (5), iş kuralları, veri seti şeması (JSON), UI akışı,
  güvenlik (PII, encryption, rate limit, audit).

### Endpoint'ler (5, planlanan)

- POST `/api/v1/tenant/{tenantId}/exports` (create)
- GET `/api/v1/tenant/exports` (list)
- GET `/api/v1/tenant/exports/{id}` (status)
- GET `/api/v1/tenant/exports/{id}/download` (signed URL)
- DELETE `/api/v1/tenant/exports/{id}` (cancel/delete)

### İş Kuralları

- **Asenkron job:** BullMQ queue; status pending →
  running → completed | failed; 3 retry → dead_letter.
- **Format:** JSON (NDJSON streaming); CSV opsiyonel
  (FAZ-13+).
- **Compression:** gzip.
- **Encryption:** tenant public key (client-side
  decrypt, FAZ-12+).
- **Signed URL:** 24 saat geçerli; one-time download
  opsiyonel.
- **Retention:** 30 gün (dosya); 7 yıl (metadata audit).
- **Rate limit:** 1 export/gün/tenant (default);
  SUPERADMIN override.
- **Audit:** `audit:tenant.export.created`,
  `audit:tenant.export.downloaded`,
  `audit:tenant.export.deleted`.

### Veri Seti

- owners, patients, examinations, vaccinations,
  prescriptions, sales, payments, lab_results,
  imaging_orders, files (NDJSON).

## Yapılmayanlar / Bilinçli Atlamalar

- **CSV/Excel export** → Faz 13+ (FAZ-12 yalnızca JSON).
- **Scheduled exports (haftalık otomatik)** → Faz 13+.
- **S3 Glacier long-term storage** → Faz 13+ (7 yıl
  retention).
- **Tenant cross-region export** → Faz 13+ (multi-region
  disaster için).
- **Client-side encryption UI** → Faz 12+ (web crypto
  API + key management).

## Döküman Uyum

- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler

- `tenant-export.service.spec.ts` (FAZ-12+): asenkron
  job, signed URL, retention, audit.
- Manuel test: pilot tenant'ta.

## Commit

- Docs: (bu commit) — `docs(security): GOAL-125 tenant veri dışa aktarma dokümanı`
