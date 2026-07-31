# RAG Chunk Producer (GOAL-116, FAZ-11)

Markdown dokümanları AI_CHUNKS.yaml formatına dönüştüren
RAG chunk production pipeline.

## Kullanım

```bash
# Workflow docs'larından chunk üret (docs/workflows/*.md)
pnpm --filter @vetniva/rag-chunk-producer produce:workflows

# Page kataloğundan chunk üret (docs/pages/*.yaml)
pnpm --filter @vetniva/rag-chunk-producer produce:pages

# Custom kaynak
pnpm --filter @vetniva/rag-chunk-producer produce --source docs/errors
```

## Pipeline

1. **Discovery** — `source` dizinindeki tüm `.md` / `.yaml`
   dosyalarını bul.
2. **Parse** — frontmatter + body bölümlerini ayır
   (Markdown için).
3. **Extract** — chunk sınırlarını tespit et:
   - Markdown: `## Başlık` → yeni chunk
   - YAML: dosya başına bir chunk
4. **Enrich** — metadata (type, locale, version,
   last_verified_at) ekle.
5. **Emit** — `docs/ai/AI_CHUNKS.yaml` dosyasına append et
   (idempotent: chunk_id mevcutsa atla).

## Chunk Şeması

`docs/ai/CHUNK_SCHEMA.md`'de tanımlı. Her chunk
`type: glossary | flow | field | permission | error | page`
alanlarından birini taşır.

## Testler

```bash
pnpm --filter @vetniva/rag-chunk-producer test
```

- `tests/workflow.test.ts` — workflow markdown → chunk
  dönüşümü.
- `tests/page.test.ts` — page YAML → chunk dönüşümü.
- `tests/idempotent.test.ts` — aynı kaynak iki kez
  çalıştırılırsa duplicate oluşmaz.

## Pipeline sınırlamaları

- **Embedding üretimi** → Faz 12+ (OpenAI ada-002).
- **Vector store ingestion** → Faz 12+ (Qdrant/pgvector).
- **Cron job (otomatik regenerate)** → Faz 12+ (her
  gece 03:00'te çalışır).

## İlgili dokümanlar

- `docs/ai/CHUNK_SCHEMA.md` — chunk yapısı.
- `docs/ai/AI_KNOWLEDGE_BASE.md` — RAG mimarisi.
- `goals/GOAL-005_COMPLETION_REPORT.md` — initial seed.
- `goals/GOAL-116_COMPLETION_REPORT.md` — bu production
  pipeline.
