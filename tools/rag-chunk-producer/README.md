# RAG Chunk Producer (GOAL-116, FAZ-11)

Markdown dokumanlari AI_CHUNKS.yaml formatina donusturen
RAG chunk production pipeline.

## Kullanim

### CLI

```bash
# Workflow docs'larindan chunk uret (docs/workflows/*.md)
pnpm --filter @vetniva/rag-chunk-producer produce:workflows

# Page katalogundan chunk uret (docs/pages/*.yaml)
pnpm --filter @vetniva/rag-chunk-producer produce:pages

# Custom kaynak
pnpm --filter @vetniva/rag-chunk-producer produce --source docs/errors
```

### CLI Bayraklar (GOAL-116, FAZ-11)

```bash
# Kuru çalıştırma: dosya yazmadan plan istatistikleri.
pnpm --filter @vetniva/rag-chunk-producer produce --source docs --dry-run

# Hash modunda idempotent merge (içerik değişmişse güncelle).
pnpm --filter @vetniva/rag-chunk-producer produce --source docs --hash-only

# JSONL ihracatı (FAZ-12+ vektör DB loader için).
pnpm --filter @vetniva/rag-chunk-producer produce --source docs --jsonl

# JSON formatında çıktı (CI / orchestrator entegrasyonu).
pnpm --filter @vetniva/rag-chunk-producer produce --source docs --dry-run --json
```

Bayraklar birleştirilebilir: `--dry-run --json`,
`--hash-only --jsonl` vb. Detaylı komütasyon için
[`docs/operations/RAG_CHUNK_PRODUCTION.md`](../../docs/operations/RAG_CHUNK_PRODUCTION.md)
bakın.

### Programmatic

```ts
import { runPipeline } from "@vetniva/rag-chunk-producer";

const result = await runPipeline({
  sourceDir: "docs/workflows",
  outputFile: "docs/ai/AI_CHUNKS.yaml",
  defaultLocale: "tr-TR",
  runAt: new Date().toISOString().slice(0, 10),
});

console.log(result); // { total, added, skipped }
```

## Pipeline

1. **Discovery** — `source` dizinindeki tum `.md` / `.yaml`
   dosyalarini bul (recursive).
2. **Parse** — frontmatter + body bolumlerini ayir
   (Markdown icin).
3. **Extract** — chunk sinirlarini tespit et:
   - Markdown: `## Baslik` → yeni chunk
   - YAML: dosya basina bir chunk
4. **Enrich** — metadata (type, locale, version,
   last_verified_at) ekle.
5. **Emit** — `docs/ai/AI_CHUNKS.yaml` dosyasina append et
   (idempotent: chunk_id mevcutsa atla).

## Output semasi

`AI_CHUNKS.yaml` mixed YAML formatinda yazilir. Ilk dokuman metadata,
ikinci dokuman `chunks` listesidir.

```yaml
version: "1.0.0"
generated_by: "@vetniva/rag-chunk-producer"
chunks:
  - chunk_id: flow-vaccine_md-asi-kaydi
    type: flow
    source: docs/workflows/vaccine.md
    entity: workflows/vaccine
    locale: tr-TR
    version: "1.0.0"
    last_verified_at: "2026-07-31"
    confidence: high
    pii: false
    title: Asi Kaydi
    content: |
      Asi uygulamasi kaydetmek icin...
    keywords: [asi, kayit, uygulama]
    related_chunks: []
    related_pages: []
    related_api:
      - /api/v1/clinic/vaccines/applications
```

Detayli sema: `docs/ai/CHUNK_SCHEMA.md`.

## AI_CHUNKS.yaml merge kurallari

`mergeChunks()` fonksiyonu `AI_CHUNKS.yaml` dosyasina yeni
chunk'lari eklerken asagidaki kurallari uygular:

1. **Idempotency (varsayılan)**: `chunk_id` zaten dosyada
   varsa yeni chunk atlanir. Bu sayede ayni kaynak iki kez
   calistirildiginda duplicate olusmaz.
2. **Hash-tabanlı dedup (`--hash-only`)**: `chunk_id` aynı
   - `contentHash` aynıysa atla; `contentHash` değişmişse
     mevcut kaydı yenisiyle değiştir. CI için "hangi docs
     değişti?" sorusunu netleştirir.
3. **Backward compatibility**: Eski format (sadece array) ve
   yeni format (mapping + chunks) desteklenir. Eski formatta
   yazilmis dosyalar otomatik olarak yeni formata migrate edilir.
4. **Metadata preservation**: Mapping formatindaki metadata
   (version, generated_by vb.) merge sirasinda korunur.
5. **Atomik yazma**: Dosya yazimi tek bir `writeFile` atomik
   islemidir; basarisiz olursa dosya onceki haliyle kalir.
6. **contentHash backfill**: Eski seed chunk'lar
   (GOAL-005) `contentHash` içermez. İlk merge'de
   `sha256:legacy:<chunk_id>` sentinel hash atanır;
   sonraki gerçek üretimde eksik kayıt tam içerikle
   değiştirilir.

## Testler

```bash
pnpm --filter @vetniva/rag-chunk-producer test
```

- `tests/producer.test.ts` — chunkMarkdown, chunkYaml,
  mergeChunks temel davranis testleri.
- Worker tarafinda `apps/worker/src/workers/rag-chunk.worker.spec.ts`
  — spawn modu + scheduler uçtan uca testleri.

## Scheduler (uretici)

Worker process (`apps/worker`) icerisinde periyodik scheduler
calisir; detay icin `docs/operations/RAG_CHUNK_PIPELINE.md`.

## Pipeline sinirlamalari

- **Embedding uretimi** → Faz 12+ (OpenAI ada-002).
- **Vector store ingestion** → Faz 12+ (Qdrant/pgvector).
- **Cron job (otomatik regenerate)** → Faz 12+ (her
  gece 03:00'te calisir). GOAL-116 ile 6 saatlik aralikla
  scheduler eklenmistir; Faz 12+ ile daha sik calisabilir.

## Ilgili dokumanlar

- `docs/ai/CHUNK_SCHEMA.md` — chunk yapisinin sema referansi.
- `docs/ai/AI_KNOWLEDGE_BASE.md` — RAG mimarisi.
- `docs/operations/RAG_CHUNK_PIPELINE.md` — scheduler + web index
  entegrasyonu.
- `goals/GOAL-005_COMPLETION_REPORT.md` — initial seed.
- `goals/GOAL-116_COMPLETION_REPORT.md` — bu production pipeline.
