# RAG Chunk Production Pipeline (GOAL-116, FAZ-11)

`tools/rag-chunk-producer` Markdown/YAML dokumanlari tarayip
`docs/ai/AI_CHUNKS.yaml` dosyasina RAG chunk uretir. Bu dokuman
uretim hatinin ne yaptigini, nasil calistigini, scheduler
entegrasyonunu ve web index planini ozetler.

## Ne yapar

1. **Discovery** — `source` dizinindeki tum `.md`, `.yaml`, `.yml`
   dosyalarini recursive olarak bulur.
2. **Parse** — Markdown icin frontmatter + body; YAML icin tek
   dokuman modeli.
3. **Extract** — Markdown `## Baslik` sinirlariyla chunk'lara
   ayrilir; YAML dosya basina tek chunk.
4. **Enrich** — `type`, `locale`, `version`, `last_verified_at`,
   `confidence`, `pii`, `keywords`, `related_api` metadata ile
   zenginlestirilir.
5. **Emit** — `docs/ai/AI_CHUNKS.yaml` dosyasina idempotent merge
   yapilir. `chunk_id` mevcutsa atlanir.

## Nasil calistirilir

### Manuel

```bash
# Workflow docs'larindan chunk uret
pnpm --filter @vetniva/rag-chunk-producer produce:workflows

# Page kataloğundan chunk uret
pnpm --filter @vetniva/rag-chunk-producer produce:pages

# Custom kaynak
pnpm --filter @vetniva/rag-chunk-producer produce --source docs/errors
```

### Scheduler (uretici)

Worker process (`apps/worker`) icerisinde periyodik scheduler
calisir. `RAG_CHUNK_CRON_SCHEDULE = "0 */6 * * *"` sabiti her 6
saatte bir (cron formati 6-saatlik aralikla) tum docs dizinlerini
tarar. Scheduler her saat basi icin idempotent bir `jobId` uretir;
ayni saat icinde ikinci bir tick BullMQ tarafindan reddedilir.

Scheduler davranisi `apps/worker/src/scheduler/rag-chunk-scheduler.ts`
dosyasinda tanimli; `production` ortaminda otomatik baslar.

### Orchestrator alternatifi

Uretimde orchestrator-driven (Kubernetes CronJob, AWS EventBridge,
GCP Cloud Scheduler vb.) tercih edilir. Bu durumda worker icindeki
scheduler kapatilir (`NODE_ENV !== "production"` veya scheduler
kaldirilir). Orchestrator'un periyodik olarak su komutu calistirmasi
yeterlidir:

```bash
pnpm --filter @vetniva/rag-chunk-producer produce --source docs
```

## Output format

`AI_CHUNKS.yaml` mixed YAML formatinda yazilir. Ilk dokuman metadata,
ikinci dokuman `chunks` listesidir. Her chunk su alanlari tasir:

```yaml
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

## Web index entegrasyonu

API tarafinda (`apps/api/src/modules/ai/`) `AiRagIndexService`
chunk dosyasini in-memory okur ve basit TF-IDF benzeri keyword
search saglar.

### Endpoint'ler

- `GET /api/v1/ai/rag/search?q=...&locale=tr-TR&topK=10` —
  SUPERADMIN erisimli arama endpoint'i.
- `GET /api/v1/ai/rag/stats` — indeks saglik + toplam chunk sayisi.

### Uretim vector DB plani

In-memory TF-IDF scoring pilot kapsaminda yeterlidir. Faz 12+ ile
asagidaki mimariye gecilecek:

- **Embedding** — OpenAI `text-embedding-3-small` (1536 dim) veya
  Cohere `embed-multilingual-v3` (1024 dim). Chunk basina embedding
  metadata'ya eklenir.
- **Vector store** — Qdrant (self-hosted) veya pgvector (PostgreSQL
  uzantisi, RLS ile ayni politika). Tenant filtresi `tenant_id`
  metadata'si uzerinden yapilir.
- **Hybrid search** — Vector similarity + BM25 keyword. Reciprocal
  Rank Fusion (RRF) ile birlestirilir.
- **Worker ingest** — RAG chunk producer her chunk uretildiginde
  embedding job'unu `ai-embedding` queue'suna ekler; ayri bir
  worker vector store'a yazar.

Bu gecis `chunk_id` stabil oldugu icin backward-compatible olur;
chunk semasi ve API sozlesmesi degismez, sadece storage katmani
degisir.

## Test

```bash
# Producer
pnpm --filter @vetniva/rag-chunk-producer test

# Worker (rag-chunk job)
pnpm --filter @vetniva/worker test

# API (ai-rag-index)
pnpm --filter @vetniva/api test
```

## Ilgili dokumanlar

- `tools/rag-chunk-producer/README.md` — CLI kullanim detaylari.
- `docs/ai/CHUNK_SCHEMA.md` — chunk sema referansi.
- `docs/ai/AI_KNOWLEDGE_BASE.md` — RAG mimarisi.
- `docs/operations/RAG_CHUNK_PRODUCTION.md` — üretim scheduler
  stratejisi, hash-tabanlı dedup, JSONL ihracatı, FAZ-12+
  retrieval planı (kapsamlı operasyonel rehber).
- `goals/GOAL-116_COMPLETION_REPORT.md` — bu production pipeline.
