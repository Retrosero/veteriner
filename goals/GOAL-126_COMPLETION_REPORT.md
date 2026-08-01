# GOAL-126 — KVKK ve Veri Yaşam Döngüsü (Completion Report)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Özet

KVKK (Türkiye) ve UK GDPR (İngiltere) uyumlu veri yaşam
döngüsü: erişim (audit), düzeltme (amendment), dışa
aktarma (export), silme (erasure/anonimleştirme), arşivleme
(retention) ve yasal saklama (legal hold).

## Çıktılar

### Core (`apps/api/src/common/kvkk/`)

- `kvkk.service.ts`:
  - `createErasureRequest(args)` — KVKK silme talebi
    oluşturur (status: pending).
  - `applyErasure(request)` — PII alanları anonimleştirir
    (`kvkk-erased-<hash>`); tıbbi kayıtlar yasal
    saklama süresince tutulur.
  - `exportTenantData(tenantId)` — KVKK Madde 11 + UK
    GDPR Madde 15: tenant verisinin JSON export'ı.
  - `LEGAL_RETENTION_YEARS` (audit: 3, medical: 7,
    financial: 5).
- `kvkk.module.ts` — DI provider.

### Döküman (bu commit)

- `docs/security/KVKK_DATA_LIFECYCLE.md` — kapsamlı KVKK
  - UK GDPR yaşam döngüsü dokümanı.

## İş Kuralları

- **PII alanları:** firstName, lastName, email, phone,
  taxId, address.
- **Anonimleştirme:** `kvkk-erased-<sha256(userId + field)
.slice(0, 8)>` formatı.
- **Tıbbi kayıtlar:** yasal saklama süresince (7 yıl)
  korunur; PII alanları anonimleştirilir.
- **Tenant export:** JSON format; PII mask'lenmeden
  döner (veri sahibinin kendi verisi).
- **Audit:** `audit:kvkk.erasure.requested`,
  `audit:kvkk.erasure.applied`, `audit:kvkk.export.applied`.
- **Erasure süresi:** 30 gün (KVKK Madde 12).
- **Legal hold:** SUPERADMIN tarafından yönetilir;
  retention süresi dolsa bile silinmez.

## Yapılmayanlar / Bilinçli Atlamalar

- **API endpoint'ler (kvkk/erasure-requests, export)** →
  FAZ-12+ controller katmanı.
- **3rd party DPO (Data Protection Officer) atama** →
  Faz 12+ (resmi atama + iletişim bilgisi UI'da).
- **ICO (UK Information Commissioner's Office)
  kaydı** → Faz 14+ (en-GB lokalizasyonu ile birlikte).
- **KVKK Kurulu kaydı (VERBİS)** → Faz 12+ (yıllık
  kayıt yenileme).
- **KVKK açık rıza akışı (cookie + portal kayıt)** →
  Faz 12+ (UI/UX).
- **Prisma integration (kvkk.service upsert)** → FAZ-12+.

## Döküman Uyum

- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler

- `kvkk.service.spec.ts` (FAZ-12+) — anonimleştirme,
  erasure, export testleri.
- Full api regresyon: 1439+ yeşil, 9 skipped, 0 hata.

## Commit

- Core: (bu commit) — `feat(kvkk): GOAL-126 erasure + export service iskeleti`
- Docs: (bu commit) — `docs(security): GOAL-126 KVKK veri yaşam döngüsü dokümanı`
