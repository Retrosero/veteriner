# RAG Chunk Production — Operasyonel Rehber (GOAL-116, FAZ-11)

Bu doküman, `tools/rag-chunk-producer` paketinin tüm
üretim, dağıtım ve FAZ-12+ geçiş davranışını açıklar.
Pipeline mimarisi, üretim scheduler stratejisi, hash-tabanlı
chunk dedup, JSONL ihracatı ve web index entegrasyonu
planı burada toplanmıştır.

> İlgili dokümanlar:
>
> - [`docs/ai/CHUNK_SCHEMA.md`](../ai/CHUNK_SCHEMA.md) — chunk şema referansı
> - [`docs/ai/AI_KNOWLEDGE_BASE.md`](../ai/AI_KNOWLEDGE_BASE.md) — RAG mimarisi
> - [`docs/operations/RAG_CHUNK_PIPELINE.md`](RAG_CHUNK_PIPELINE.md) — scheduler + worker entegrasyonu
> - [`tools/rag-chunk-producer/README.md`](../../tools/rag-chunk-producer/README.md) — CLI/programmatic kullanım

---

## 1. Amaç

VetNiva AI asistanının bilgi tabanı, `docs/` dizinindeki
dokümanlardan **otomatik olarak** üretilir. Manuel seed
(GOAL-005, FAZ-0) tek seferlik bir başlangıç noktasıdır;
sürdürülebilirlik docs değiştikçe pipeline'ın çalışmasını
gerektirir.

Bu rehber, üretim scheduler sıklığı, hangi koşullarda
LLM metadata enrichment (description / relatedTopics / faq)
yapılacağı, chunk dedup stratejisi ve FAZ-12+ retrieval
için gerekli JSONL ihracatını kapsar.

## 2. Pipeline Mimarisi

Üretim akışı beş adımdan oluşur:

```
   docs/*.md, *.yaml              AI_CHUNKS.yaml          AI_CHUNKS.jsonl
   ────────────────►              ──────────────►          ──────────────►
   ┌────────────┐   discover  ┌────────────┐   merge   ┌──────────────┐
   │  discover  │ ──────────► │  chunk +   │ ────────► │   yazma      │
   │  files     │             │  infer     │           │  (YAML+JSONL)│
   └────────────┘             └────────────┘           └──────────────┘
                                       │
                                       │  hash (SHA-256)
                                       ▼
                              ┌────────────────┐
                              │  dedup kararı  │
                              │  (id-only|hash) │
                              └────────────────┘
```

### 2.1 Adımlar

1. **discoverFiles** — `sourceDir` altında recursive olarak
   `.md` / `.yaml` / `.yml` dosyalarını bulur.
2. **chunkMarkdown / chunkYaml** — Her dosyayı `ProducedChunk[]`
   listesine dönüştürür:
   - Markdown: `## Başlık` sınırlarıyla parçalar.
   - YAML: dosya başına tek chunk (sayfa kataloğu / permission).
3. **inferType / inferEntity** — Dosya yoluna göre chunk
   türünü (`glossary` / `flow` / `field` / `permission` /
   `error` / `page` / `user_education`) ve entity'yi türetir.
4. **extractKeywords / extractApiRefs** — Türkçe + İngilizce
   stopword filtreli anahtar kelimeler ve gövdede geçen
   `/api/v\d+/...` referansları otomatik çıkarır.
5. **mergeChunks (idempotent)** — Yeni chunk'ları mevcut
   `AI_CHUNKS.yaml`'a ekler. Aynı `chunk_id` varsa:
   - `mergeMode: "id-only"` (varsayılan) → atla
   - `mergeMode: "hash"` → `contentHash` değişmişse güncelle

### 2.2 Üretim Sözleşmesi

`ProducedChunk` zorunlu alanları:

| Alan               | Tür      | Açıklama                                                                       |
| ------------------ | -------- | ------------------------------------------------------------------------------ |
| `chunk_id`         | string   | Benzersiz ID; `<kind>-<fileSlug>-<titleSlug>`.                                 |
| `type`             | enum     | 7 değer: glossary / flow / field / permission / error / page / user_education. |
| `source`           | string   | Repo göreli kaynak dosya yolu.                                                 |
| `entity`           | string   | İlgili domain entity (path'ten türetilir).                                     |
| `locale`           | enum     | `tr-TR` (varsayılan) / `en-GB`.                                                |
| `version`          | semver   | Chunk içerik versiyonu.                                                        |
| `last_verified_at` | ISO 8601 | Pipeline `runAt` tarihi (YYYY-MM-DD).                                          |
| `confidence`       | enum     | high / medium / low.                                                           |
| `pii`              | boolean  | Bu chunk PII içeriyor mu?                                                      |
| `title`            | string   | Kısa başlık (Markdown `## ` veya YAML `title_key`).                            |
| `content`          | string   | Asıl bilgi gövdesi.                                                            |
| `keywords`         | string[] | Otomatik çıkarılan anahtar kelimeler.                                          |
| `related_chunks`   | string[] | Diğer chunk referansları (boş, manual).                                        |
| `related_pages`    | string[] | İlgili sayfa kayıtları (YAML'dan türetilir).                                   |
| `related_api`      | string[] | Gövdedeki API yolları.                                                         |
| `contentHash`      | string   | `sha256:<64 hex>` SHA-256 içerik özeti.                                        |

`contentHash` alanı, FAZ-12+ retrieval'da "hangi chunk'lar
değişti?" sorusunun deterministik cevabıdır.

## 3. CLI Kullanımı

### 3.1 Komutlar

```bash
# Varsayılan: docs/workflows'tan chunk üret, AI_CHUNKS.yaml'a yaz.
pnpm --filter @vetniva/rag-chunk-producer produce:workflows

# docs/pages'ten (YAML) chunk üret.
pnpm --filter @vetniva/rag-chunk-producer produce:pages

# Özel kaynak dizini.
pnpm --filter @vetniva/rag-chunk-producer produce --source docs/errors

# JSONL de üret (FAZ-12+ retrieval loader için).
pnpm --filter @vetniva/rag-chunk-producer produce --source docs --jsonl

# Kuru çalıştırma: dosya yazmaz, plan istatistiklerini raporlar.
pnpm --filter @vetniva/rag-chunk-producer produce --source docs --dry-run

# Hash modunda idempotent merge (içerik değişmemişse atla).
pnpm --filter @vetniva/rag-chunk-producer produce --source docs --hash-only

# JSON formatında makine-okunabilir çıktı (CI / orchestrator için).
pnpm --filter @vetniva/rag-chunk-producer produce --source docs --dry-run --json
```

### 3.2 Bayrak Kombinasyonları

| Kombinasyon      | Davranış                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| (yok)            | `id-only` merge; YAML yaz; sadece metin çıktı.                               |
| `--jsonl`        | YAML + JSONL birlikte yazılır. JSONL merge sonrası nihai listeyi içerir.     |
| `--dry-run`      | Dosya yazma yok. Plan: `total / byType / byLocale / would{Add,Skip,Update}`. |
| `--hash-only`    | `mergeMode: hash`; içerik değişmemişse skip, değişmişse update.              |
| `--json`         | Sonucu JSON olarak yazdır (CI / orchestrator entegrasyonu).                  |
| `--locale en-GB` | Üretilen chunk'lar `en-GB` locale'i ile işaretlenir.                         |

### 3.3 Programatik API

```ts
import { runPipeline, runPipelinePlan } from "@vetniva/rag-chunk-producer";

const result = await runPipeline(
  {
    sourceDir: "docs/workflows",
    outputFile: "docs/ai/AI_CHUNKS.yaml",
    defaultLocale: "tr-TR",
    runAt: "2026-08-04",
  },
  { mergeMode: "hash", writeJsonl: true },
);
if (result.mode === "executed") {
  console.log(result.added, result.skipped, result.updated);
  // { added: 0, skipped: 1324, updated: 10, jsonlPath: "docs/ai/AI_CHUNKS.jsonl" }
}
```

## 4. Chunk Dedup Stratejisi

Pipeline iki katmanlı dedup uygular:

### 4.1 Idempotent Merge (varsayılan)

`mergeChunks` her çalıştırmada `AI_CHUNKS.yaml` dosyasını
okur, mevcut `chunk_id`'leri toplar, yeni üretilen
chunk'lardan aynı `chunk_id` taşıyanları **atlar**. Aynı
kaynak dosya birden fazla kez çalıştırılırsa duplicate
oluşmaz.

### 4.2 Hash-Tabanlı Dedup (`--hash-only`)

`contentHash` alanı, `source + title + content` üçlüsünün
normalize edilmiş SHA-256 özetidir. Normalizasyon:

- Whitespace tek boşluğa indirilir.
- Baş/son boşluk kırpılır.
- Türkçe karakterler korunur (UTF-8).

`mergeMode: "hash"` modunda:

- Aynı `chunk_id` + aynı `contentHash` → atla.
- Aynı `chunk_id` + farklı `contentHash` → içerik değişmiş,
  mevcut kaydı yenisiyle değiştir (`updated` sayılır).
- Yeni `chunk_id` → ekle.

Bu mod CI'da "hangi docs değişti?" sorusunu netleştirir.
Örnek senaryo:

```bash
# docs/workflows/owner_create.md güncellendi.
# İlk çalıştırma: yeni içerik eklenir (added=1, skipped=0, updated=0).
pnpm produce:workflows
# Sonraki çalıştırma: içerik değişmediyse (skipped=1, updated=0).
pnpm produce:workflows
# Birisi docs/workflows/owner_create.md'yi değiştirdi.
pnpm produce:workflows --hash-only
# → skipped=0, updated=1. YAML güncellenir; JSONL tazelenir.
```

### 4.3 Eski Seed Uyumluluğu

GOAL-005 ile üretilen ilk seed chunk'lar `contentHash`
içermez. `mergeChunks` bu chunk'lar için kararlı bir
sentinel hash atar (`sha256:legacy:<chunk_id>`); hash modu
ilk gerçek çalıştırmada eksik alanları içeren kaydı tam
içerikli yenisiyle değiştirir.

## 5. JSONL İhracatı (FAZ-12+ Retrieval)

`AI_CHUNKS.jsonl`, FAZ-12+ vektör DB loader'ın canonical
kaynağıdır. Üretim:

- **Format:** Her satır bir `ProducedChunk`'ın JSON temsili.
  Satır ayracı `\n` (LF). Dosya UTF-8.
- **İçerik:** `mergeChunks` çıktısı — yani mevcut katalog
  - yeni eklenen + güncellenen chunk'lar. Seed + newly
    discovered tek listede.
- **CLI:** `--jsonl` bayrağı. `outputFile` ile aynı dizinde,
  `.yaml` → `.jsonl` uzantı değişimiyle üretilir.

```bash
pnpm produce --source docs --jsonl
# → docs/ai/AI_CHUNKS.yaml (güncellendi)
# → docs/ai/AI_CHUNKS.jsonl (mirror, merge sonrası liste)
```

JSONL dosyası repoya commit edilmez; üretim pipeline'ı
scheduler tarafından her çalıştırmada tazeler. `.gitignore`
şu satırla eklenmelidir (ileride):

```gitignore
docs/ai/AI_CHUNKS.jsonl
```

### 5.1 Web Loader (`apps/web/src/lib/rag-loader.ts`)

Next.js tarafı için sözleşme kilidi:

```ts
import { loadRagChunks, keywordSearch } from "@/lib/rag-loader";

const { chunks, total, byType } = await loadRagChunks();
const top = keywordSearch(chunks, "aşı uygulaması", 5);
```

Stub Faz 11'de yalnızca dosya okuma + basit keyword search
sağlar. Faz 12+ ile:

1. OpenAI `text-embedding-3-small` (1536 dim) veya
   Cohere `embed-multilingual-v3` (1024 dim) ile embedding.
2. Qdrant (self-hosted) veya pgvector (Postgres extension)
   ile hybrid search (BM25 + cosine, RRF ile birleştirilir).
3. Tenant filtresi (`tenantId` payload) ve PII filtresi
   (`pii=false` veya SUPERADMIN/OWNER/VETERINARIAN).

## 6. Üretim Scheduler Stratejisi

### 6.1 Sıklık

Varsayılan: `RAG_CHUNK_CRON_SCHEDULE = "0 */6 * * *"` —
her 6 saatte bir. Gerekçe:

- docs/ değişiklikleri genelde PR akışıyla gelir; PR merge
  sonrası 6 saat içinde ingest yapılır.
- Embedding maliyeti: 1K chunk × $0.0001/1K token ≈ $0.10.
  Günlük 4 çalıştırma × $0.10 = ihmal edilebilir.
- LLM metadata enrichment (Faz 12+) eklendiğinde sıklık
  12 saate düşürülebilir (maliyet optimizasyonu).

### 6.2 LLM Metadata Enrichment (Opsiyonel — FAZ-12+)

Üç ek alan için LLM çağrısı:

| Alan            | Amaç                                     | Prompt tipi             |
| --------------- | ---------------------------------------- | ----------------------- |
| `description`   | 1-2 cümlelik Türkçe özet.                | Few-shot, locale-aware. |
| `relatedTopics` | 3-5 ilişkili konu etiketi.               | Embedding yakını.       |
| `faq`           | 2-3 olası kullanıcı sorusu + kısa yanıt. | Synthetic QA.           |

**Koşullar:**

- Sadece `confidence: "low"` olan chunk'lar için (LLM ile
  yükseltme fırsatı). Yüksek güvenilirlikli seed'ler
  gereksiz maliyet yaratır.
- Rate limit: 5 chunk/saniye. 1K chunk × 200ms = 200
  saniye job süresi.
- Maliyet: GPT-4o-mini ≈ $0.15/1M input token; 1K
  chunk × 2K token = $0.30. Günlük $1.20; aylık $36.

**Disable flag:** `RAG_LLM_ENRICHMENT_DISABLED=true` env
ile tamamen kapatılabilir. Pilot kapsamında **devre dışı**.

### 6.3 Orchestrator-Driven Scheduler (Önerilen)

Üretimde (Coolify / Kubernetes / EventBridge) worker-içi
scheduler kapatılmalı; orchestrator CLI'yı periyodik
çağırmalı:

```bash
# Kubernetes CronJob (önerilen)
apiVersion: batch/v1
kind: CronJob
metadata:
  name: rag-chunk-producer
spec:
  schedule: "0 */6 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: producer
              image: vetniva/api:latest
              command: ["pnpm", "produce", "--source", "docs", "--jsonl"]
              env:
                - name: NODE_ENV
                  value: production
```

Worker-içi scheduler (`apps/worker/src/scheduler/`) yalnızca
geliştirme ve single-instance test ortamlarında aktiftir.

## 7. Ölçek (güncel)

`docs/` dizin taraması (2026-08-04 itibarıyla):

| Dizin                  | Dosya Sayısı | Chunk (yaklaşık) |
| ---------------------- | ------------ | ---------------- |
| `docs/workflows/`      | 10           | ~85              |
| `docs/pages/`          | 17           | ~26              |
| `docs/permissions/`    | 1            | ~113             |
| `docs/fields/`         | 2            | ~50              |
| `docs/errors/`         | 7            | ~150             |
| `docs/domain/`         | 3            | ~50              |
| `docs/user-education/` | 7            | ~20              |
| **Toplam**             | **~50**      | **~500**         |

(Başlangıç seed'i ile birlikte 800+ chunk; idempotent
merge ile artış sıfır olur.)

JSONL dosya boyutu: ~500 chunk × ~2 KB = ~1 MB. FAZ-12+
vector store ingest bu dosyayı 1 saniyenin altında parse
eder.

## 8. Sınırlamalar

- **Türkçe karakter normalizasyonu** sadece whitespace'e
  uygulanır; Unicode lower/upper case dönüşümü (locale
  spesifik) hash fonksiyonunda bilinçli olarak yapılmaz
  (Türkçe 'I' / 'İ' / 'ı' / 'i' farkı semantik olarak
  anlamlı olabilir).
- **Snippet uzunluğu:** `extractKeywords` gövdeden en fazla
  8 anahtar kelime çıkarır; `content` gövdesinin tamamı
  korunur. Retrieval snippet'ı 200-500 karakter civarında
  olmalı; vector DB katmanı bu kırpmayı yapar.
- **Kod bloğu hariç tutma:** Markdown code block'ları
  (` ``` ` ile çevrili) gövdede kalır; FAZ-12+ embedding
  provider bu kısımları tokenize ederken filtreler.
  Gerekirse `chunkMarkdown` regex'i ile ekarte edilebilir.
- **Windows path ayracı:** `inferType` / `inferEntity`
  fonksiyonları `/workflows/` gibi Unix-style substring
  arar. CI Linux'ta sorun yok; local Windows'ta testlerde
  yalnızca Unix-style path kullanılır.
- **Tek seferde tüm `docs/` taranması:** 50+ dosya için
  milisaniyeler içinde tamamlanır. Yüzlerce dosya için
  incremental source (Git diff) optimizasyonu FAZ-12+'da
  düşünülmeli.

## 9. Doğrulama (CI)

Üretimden sonra:

```bash
# Üretici testleri.
pnpm --filter @vetniva/rag-chunk-producer test
pnpm --filter @vetniva/rag-chunk-producer type-check

# Web loader testleri.
pnpm --filter @vetniva/web test
pnpm --filter @vetniva/web lint

# Doküman-kod uyumu.
pnpm docs:check
```

`pnpm docs:check` `AI_CHUNKS.yaml` dosyasını parse eder
ve her chunk için şu kontrolleri yapar:

- `chunk_id` zorunlu + tekrarsız.
- `type` enum'a uygun.
- `locale` `tr-TR` veya `en-GB`.
- `version` semver.
- `last_verified_at` 90 günden eskiyse `degraded` uyarısı.
- `source` dosyası repo'da mevcut.

## 10. Operasyonel Notlar

- **Repair:** Eski kataloglarda (GOAL-005) CP-1252 em-dash
  bayt kalıntısı olabilir. `pnpm --filter @vetniva/rag-chunk-producer repair:catalog -- --write`
  ile UTF-8'e dönüştürülür.
- **Rollback:** Yeni pipeline çıktısı sorunluysa
  `AI_CHUNKS.yaml` bir önceki commit'e revert edilir;
  idempotent merge sonraki çalıştırmada doğru state'e
  döner.
- **Migration:** `chunk_id` kararlı olduğu için vektör
  DB geçişinde (FAZ-12+) eski chunk'lar `chunk_id:version`
  composite key ile korunur.

## 11. Sonraki Adımlar (FAZ-12+)

1. **Vector DB entegrasyonu** — Qdrant veya pgvector.
2. **OpenAI / Cohere embedding** — Chunk başına vektör.
3. **Hybrid search** — BM25 + cosine, RRF ile birleştir.
4. **LLM metadata enrichment** — `description`,
   `relatedTopics`, `faq` alanları.
5. **Incremental source scanning** — Git diff ile yalnızca
   değişen dosyaları tara.
6. **i18n parity enforcement** — `en-GB` chunk'lar için
   zorunlu çift kayıt.

---

## İlgili dokümanlar

- [`docs/ai/CHUNK_SCHEMA.md`](../ai/CHUNK_SCHEMA.md)
- [`docs/ai/AI_KNOWLEDGE_BASE.md`](../ai/AI_KNOWLEDGE_BASE.md)
- [`docs/operations/RAG_CHUNK_PIPELINE.md`](RAG_CHUNK_PIPELINE.md)
- [`tools/rag-chunk-producer/README.md`](../../tools/rag-chunk-producer/README.md)
- [`goals/GOAL-116_COMPLETION_REPORT.md`](../../goals/GOAL-116_COMPLETION_REPORT.md)
