# GOAL-116 Completion Report — RAG Chunk Production Pipeline

## Ozet

`tools/rag-chunk-producer` paketinin uretim scheduler + web index
entegrasyonu tamamlandi. Pilot kapsaminda in-memory TF-IDF
benzeri arama endpoint'i (`GET /api/v1/ai/rag/search`) devreye
alindi. Faz 12+ ile vector DB (Qdrant/pgvector) gecisi planli.

## Degisen dosyalar

### Worker (`apps/worker`)

- `src/jobs/rag-chunk-job.ts` (yeni) — `processRagChunkJob`
  processor + Zod payload semasi. `tools/rag-chunk-producer`
  CLI'ini `tsx` ile spawn eder; stdout'tan istatistik parse eder.
- `src/queues/rag-chunk.queue.ts` (yeni) — `rag-chunk` queue
  - `RAG_CHUNK_CRON_SCHEDULE = "0 */6 * * *"` constant.
- `src/workers/rag-chunk.worker.ts` (yeni) — BullMQ Worker
  - JobRun reporter entegrasyonu.
- `src/workers/rag-chunk.worker.spec.ts` (yeni) — 6 unit test
  (gecerli payload, payload validation, bos kaynak, ornek workflow,
  idempotency, en-GB locale).
- `src/scheduler/rag-chunk-scheduler.ts` (yeni) — Periyodik
  scheduler. `production` ortaminda otomatik baslar; 7 docs
  dizinini tarayip idempotent job ekler.
- `src/main.ts` — Scheduler + worker kayitlari.

### API (`apps/api`)

- `src/common/ai/ai-chunk-loader.service.ts` (yeni) — AI_CHUNKS.yaml
  dosya okuyucu + normalize indeks + mtime cache.
- `src/modules/ai/ai-rag-index.service.ts` (yeni) — TF-IDF benzeri
  arama + tenant/PII filtreleri.
- `src/modules/ai/ai-rag-index.service.spec.ts` (yeni) — 10 unit
  test.
- `src/modules/ai/ai-rag-index.controller.ts` (yeni) — SUPERADMIN
  endpoint'leri (`/api/v1/ai/rag/search`, `/api/v1/ai/rag/stats`).
- `src/modules/ai/ai-rag-index.tokens.ts` (yeni) — DI token.
- `src/modules/ai/ai.module.ts` — Yeni controller/service kayitlari.
- `src/modules/ai/ai.controller.ts` — `generationSource` opsiyonu
  (auto | template | retrieval | hybrid).

### Docs

- `docs/operations/RAG_CHUNK_PIPELINE.md` (yeni) — Uretim hatti
  rehberi, scheduler, web index plani, vector DB gecis notu.
- `docs/api/api.get._api_v1_ai_rag_search.md` (yeni).
- `docs/api/api.get._api_v1_ai_rag_stats.md` (yeni).
- `docs/api/api.post._api_v1_ai_help.md` — `generationSource`
  alani eklendi.
- `docs/fields/fields.yaml` — `ai.source`, `ai.score`, `ai.pii`,
  `ai.matchedTerms`, `ai.results`, `ai.totalChunks`, `ai.loader`
  alanlari eklendi.
- `tools/rag-chunk-producer/README.md` — Kullanim ornekleri,
  output semasi, AI_CHUNKS.yaml merge kurallari.

### i18n

- `packages/i18n/src/locales/tr-TR.json` + `en-GB.json` —
  `rag` namespace eklendi (15 anahtar).

## Alinan kararlar

1. **Spawn vs in-process**: Worker `tools/rag-chunk-producer`
   CLI'ini `tsx` ile spawn eder. In-process import workspace
   bagimliliklarinin cozumunu gerektirirdi; spawn izole ve
   test edilebilir. Performans overhead'i ihmal edilebilir
   (her 6 saatte bir calisir).

2. **In-memory TF-IDF**: Vector DB Faz 12+'da. Pilot icin
   basit keyword scoring yeterli; ~200 chunk uzerinde
   milisaniye alti yanit sureleri.

3. **Idempotent scheduler**: Ayni saat icinde ikinci tick
   BullMQ tarafindan reddedilir (`jobId = cron:<source>:<bucket>`).
   Bu sayede scheduler coklu instance calissa bile duplicate
   uretim olmaz.

4. **SUPERADMIN-only**: `/api/v1/ai/rag/search` pilot kapsaminda
   SUPERADMIN erisimli. Uretimde rol bazli genisletme
   (`clinic:ai:read` permission) planli.

5. **PII chunk filtreleme**: PII chunk'lar yalnizca
   SUPERADMIN/OWNER/VETERINARIAN rollerine acik. Diger
   roller (STAFF, PET_OWNER_PORTAL) icin filtrelenir.

## Sonraki adimlar

1. **Vector DB entegrasyonu** (Faz 12+): Qdrant veya pgvector
   ile hybrid search (BM25 + cosine similarity).
2. **OpenAI embedding**: Chunk basina `text-embedding-3-small`
   (1536 dim) veya Cohere `embed-multilingual-v3`.
3. **Scheduler orchestration**: Kubernetes CronJob veya
   AWS EventBridge ile process ici scheduler yerine
   orchestrator-driven.
4. **Embedding job worker**: Ayrı bir `ai-embedding` queue'su
   ile chunk'lar paralel olarak embed edilir.
5. **Permission-based search**: SUPERADMIN kisitini kaldirip
   `clinic:ai:read` permission'i olan her rol erisebilir.
