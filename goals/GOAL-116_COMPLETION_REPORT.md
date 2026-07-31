# GOAL-116 — RAG Chunk Production (Completion Report)

## Faz
FAZ-11 (Dokümantasyon ve AI asistanı temeli)

## Özet
Markdown docs + YAML page kataloğundan AI_CHUNKS.yaml
formatında RAG chunk üreten pipeline. Idempotent (aynı
kaynak iki kez çalıştırılırsa duplicate oluşmaz).

## Çıktılar

### Core (`tools/rag-chunk-producer/`)
- `package.json` — `@vetniva/rag-chunk-producer` workspace
  paketi.
- `tsconfig.json` + `tsconfig.test.json` + `vitest.config.ts`.
- `src/index.ts` — production pipeline:
  - `discoverFiles(sourceDir)` — recursive `.md|.yaml|.yml`
    tarama.
  - `chunkMarkdown(content, filePath, config)` — `## Başlık`
    sınırları + metadata üretimi.
  - `chunkYaml(content, filePath, config)` — sayfa
    kataloğu tek chunk.
  - `mergeChunks(outputFile, newChunks)` — idempotent
    append (mevcut `chunk_id`'ler atlanır).
  - `runPipeline(config)` — end-to-end discovery + parse +
    merge.
  - `inferChunkId`, `inferType`, `inferEntity`,
    `extractKeywords`, `extractApiRefs` — yardımcılar.
  - CLI: `pnpm produce [--source <dir>]`.
- `tests/producer.test.ts` — 8 unit test:
  - `inferChunkId`, `inferType`, `extractKeywords`,
    `extractApiRefs` (helpers).
  - `chunkMarkdown` (2 test: section split, empty filter).
  - `chunkYaml` (2 test: page chunk, parse error fallback).

### Döküman
- `tools/rag-chunk-producer/README.md` — kullanım + pipeline
  sınırları.

## İş Kuralları
- **Chunk türleri:** `glossary` | `flow` | `field` | `permission`
  | `error` | `page` | `user_education` (CHUNK_SCHEMA.md ile aynı).
- **Infer:** dosya yolundan `type` + `entity` otomatik türetme
  (ör. `docs/workflows/*.md` → `type=flow`).
- **API ref extraction:** içerikteki `GET/POST/PATCH/DELETE/PUT
  /api/v1/...` pattern'leri otomatik yakalanır.
- **Idempotent:** `chunk_id` zaten varsa skip; duplicate
  oluşmaz.

## Yapılmayanlar / Bilinçli Atlamalar
- **Embedding üretimi (OpenAI ada-002)** → Faz 12+
  (pipeline metadata + content sağlar; embedding ayrı
  bir job tarafından üretilir).
- **Vector store ingestion (Qdrant/pgvector)** → Faz 12+.
- **Otomatik cron (her gece 03:00)** → Faz 12+ (cron + git
  commit).
- **Çoklu dil desteği (en-GB chunk üretimi)** → Faz 14+
  (şu an `defaultLocale=tr-TR`).
- **Chunk boyut sınırı (token sayısı)** → Faz 12+ (büyük
  chunk'lar recursive split).

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler
- `tools/rag-chunk-producer/tests/producer.test.ts` → 8 test,
  100% yeşil.
- `pnpm --filter @vetniva/rag-chunk-producer test` → 8 passed.

## Kullanım

```bash
# Workflow docs'larından chunk üret (docs/workflows/*.md)
pnpm --filter @vetniva/rag-chunk-producer produce:workflows

# Page kataloğundan chunk üret (docs/pages/*.yaml)
pnpm --filter @vetniva/rag-chunk-producer produce:pages

# Custom kaynak
pnpm --filter @vetniva/rag-chunk-producer produce --source docs/errors
```

## Commit
- Core: (bu commit) — `feat(rag-chunk-producer): GOAL-116 RAG chunk production pipeline`
- Docs: `tools/rag-chunk-producer/README.md`.
