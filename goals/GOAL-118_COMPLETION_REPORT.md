# GOAL-118 — Doküman-Kod CI Doğrulaması (Completion Report)

## Faz

FAZ-11 (Dokümantasyon ve AI asistanı temeli)

## Özet

Yeni alan, permission, API route, error code veya AI chunk
eklendiğinde CI hata veren doküman-kod doğrulama pipeline'ı.
`pnpm docs:check` komutu 7 scanner paralel çalıştırır; kod
ile doküman arasındaki tutarsızlıkları tespit eder.

## Çıktılar

### Core (`tools/docs-check/`)

- `src/runner.ts` — sıralı/ paralel scanner koşum.
- `src/scanners/api.ts` — API route'lar için doküman
  doğrulaması (kullanılan route → `docs/api/api.*.md` mevcut
  mu).
- `src/scanners/error-codes.ts` — VET-XXX-NNNN hata
  kodları için katalog doğrulaması (kod → ERROR_CATALOG.md
  - i18n parity).
- `src/scanners/permissions.ts` — `<domain>:<resource>:
<action>` permission'lar için katalog doğrulaması.
- `src/scanners/ai-chunks.ts` — `docs/ai/AI_CHUNKS.yaml`
  şema doğrulaması.
- `src/scanners/fields.ts` — `entity.field` referansları
  için FIELD_GLOSSARY doğrulaması.
- `src/scanners/web.ts` — Next.js route'ları için page
  kataloğu doğrulaması.
- `src/scanners/docs.ts` — `docs/errors/`, `docs/permissions/`
  referans kontrolü.
- `src/types.ts` — ortak tipler (Issue, RouteInfo, vb.).
- 4 test dosyası: `ai-chunks`, `error-codes-vet`, `fields`,
  `runner`.

## İş Kuralları

- **API route eşleşmesi:** Kontrolörde tanımlı tüm
  endpoint'ler için `docs/api/api.<method>.<path>.md`
  dosyası mevcut olmalı. Eksikse HATA.
- **Error code eşleşmesi:** Koddaki tüm `VET-XXX-NNNN`
  kodları `docs/errors/ERROR_CATALOG.md`'de tanımlı
  olmalı. Tanımsızsa HATA.
- **Permission eşleşmesi:** Koddaki tüm permission
  referansları `docs/permissions/PERMISSION_CATALOG.yaml`'da
  tanımlı olmalı. Tanımsızsa UYARI.
- **AI chunk şeması:** Her chunk `CHUNK_SCHEMA.md`'ye
  uygun olmalı. Versiyon semver, type enum, vb.
- **Field referansı:** `entity.field` formatındaki
  referanslar `FIELD_GLOSSARY.md`'de tanımlı olmalı.
- **Web route eşleşmesi:** Next.js route'ları `docs/pages/`
  kataloğunda yer almalı.

## Davranış

- `pnpm docs:check` → 7 scanner sırayla çalışır.
- Hata varsa: exit code 1 (CI kırmızı).
- Yalnızca uyarı varsa: exit code 0 (CI yeşil).
- Pre-existing hatalar FAZ-12+ temizlenecek; pilot kapsamda
  hata toleransı yüksek.

## Yapılmayanlar / Bilinçli Atlamalar

- **Otomatik kod üretimi (kod → doküman)** → Faz 13+
  (ters yön: Zod şemadan otomatik API doc üretimi).
- **Markdown lint (tutarlılık)** → Faz 12+ (markdownlint
  integration).
- **Pre-existing hata temizliği** → Faz 12+ (FAZ-11 pilot
  kapsamda 2736 pre-existing hata var; FAZ-12 kabul testleri
  ile temizlenecek).
- **CI gate strict modu** → Faz 12+ (`--strict` flag
  ile uyarılar da hata sayılır).

## Döküman Uyum

- `pnpm docs:check` → 7 scanner çalışıyor, FAZ-10 + 11
  özgü hata yok.
- `pnpm i18n:check` → temiz.

## Testler

- `tools/docs-check/tests/runner.test.ts` → runner
  testleri.
- `tools/docs-check/tests/api.test.ts` (yok; eksik).
- `tools/docs-check/tests/permissions.test.ts` (yok;
  eksik).
- `tools/docs-check/tests/web.test.ts` (yok; eksik).

## Kullanım

```bash
# Tüm scanner'ları çalıştır
pnpm docs:check

# Çıktı: 7 scanner'ın özeti (scanned counts) + issues
# Hata varsa exit code 1.
```

## İlgili dokümanlar

- `tools/docs-check/README.md` — tool kullanımı.
- `docs/ai/CHUNK_SCHEMA.md` — AI chunk şeması.
- `docs/errors/ERROR_CATALOG.md` — hata kataloğu standardı.
- `docs/permissions/PERMISSION_CATALOG.yaml` — yetki
  kataloğu.
- `docs/fields/FIELD_GLOSSARY.md` — alan sözlüğü.
- `docs/pages/PAGE_SCHEMA.md` — sayfa kataloğu şeması.
- `.github/workflows/ci.yml` — CI gate.

## Commit

- Core: (FAZ-0 + FAZ-11) — `tools/docs-check/`
- Docs: (bu commit) — `goals/GOAL-118_COMPLETION_REPORT.md`
