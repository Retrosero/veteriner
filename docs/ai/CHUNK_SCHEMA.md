# @file AI Chunk Şeması.

# @module docs/ai/CHUNK_SCHEMA

#

# @description VetNiva AI asistanının bilgi tabanındaki

# her chunk'ın yapısı, metadata alanları ve RAG ingest

# pipeline sözleşmesi. Tüm chunk'lar bu şemaya uygun

# üretilir; `pnpm docs:check` tutarlılığı doğrular.

#

# @author GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu

# @since 2026-07-30

# @security PII içeren chunk'lar mask'lenir (PII_MASKING.md).

# Hasta adı, TCKN, telefon vb. asla plain text olmaz.

# =============================================================================

# AI Chunk Şeması

VetNiva AI asistanı, kullanıcının doğal dil sorularını yanıtlamak
için **RAG (Retrieval-Augmented Generation)** pipeline'ı kullanır.
Bu pipeline'ın temel yapı taşı **chunk**'tır. Her chunk, tek bir
bilgi parçasını temsil eder ve metadata + içerik taşır.

## 1. Chunk Türleri

| Tür (`type`)   | Kaynak dosya                                | Örnek `chunk_id`                |
| -------------- | ------------------------------------------- | ------------------------------- |
| `glossary`     | `docs/domain/DOMAIN_GLOSSARY.md`            | `glossary-patient-owner`        |
| `flow`         | `docs/domain/CLINICAL_FLOWS.md`             | `flow-vaccination`              |
| `field`        | `docs/fields/FIELD_GLOSSARY.md`             | `field-patient.microchip`       |
| `permission`   | `docs/permissions/PERMISSION_CATALOG.yaml`  | `permission-clinic:owner:erase` |
| `error`        | `docs/errors/ERROR_CATALOG.md`              | `error-VET-CLINIC-0001`         |
| `audit`        | `docs/errors/AUDIT_LOG_STANDARD.md` vb.     | `audit-overview`                |
| `page`         | `docs/pages/<page>.yaml`                    | `page-web.app.locale.health`    |
| `api`          | `docs/api/<endpoint>.md`                    | `api-get._api_v1_health`        |
| `country`      | `apps/api/src/common/adapters/*.adapter.ts` | `country-tr.format_currency`    |
| `log-standard` | `docs/errors/LOG_STANDARD.md` vb.           | `log-sistem`                    |
| `pii-rule`     | `docs/errors/PII_MASKING.md`                | `pii-phone-mask`                |
| `correlation`  | `docs/errors/CORRELATION_ID.md`             | `correlation-req-prefix`        |

## 2. Yapısal Şema

Her chunk aşağıdaki alanları taşır:

```yaml
- chunk_id: glossary-patient-owner
  type: glossary
  source: docs/domain/DOMAIN_GLOSSARY.md
  entity: patient_owner
  locale: tr-TR
  version: "1.0.0"
  last_verified_at: 2026-07-30
  confidence: high # high | medium | low
  pii: true # bu chunk PII içerir mi?
  expires_at: null # opsiyonel, geçici bilgi için
  keywords:
    - hasta sahibi
    - patient owner
    - hayvan sahibi
    - müşteri
    - KVKK
  related_chunks:
    - glossary-patient
    - flow-ownership-transfer
  title: Hasta Sahibi
  content: |
    Hasta sahibi, kliniğe gelen hayvanın yasal sahibi olan
    gerçek kişidir. Her hayvanın en az bir aktif sahibi
    bulunur; sahiplik devri `flow-ownership-transfer` akışı
    ile yapılır.

    PII alanları: ad, soyad, TCKN/VKN, telefon, e-posta.
    Bu alanlar UI'da görünür ama log/audit'te mask'lenir.
```

### 2.1 Zorunlu alanlar

| Alan               | Tür      | Açıklama                                                                                                                                     |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `chunk_id`         | string   | Benzersiz ID. Küçük harf + tire. `<type>-<slug>` formatı.                                                                                    |
| `type`             | enum     | `glossary` / `flow` / `field` / `permission` / `error` / `audit` / `page` / `api` / `country` / `log-standard` / `pii-rule` / `correlation`. |
| `source`           | string   | Kaynak dosya yolu (repo göreli).                                                                                                             |
| `locale`           | enum     | `tr-TR` / `en-GB`.                                                                                                                           |
| `version`          | string   | Semver. Chunk içeriği değiştikçe artırılır.                                                                                                  |
| `last_verified_at` | ISO 8601 | Son doğrulama tarihi. 90 günü geçerse `degraded` flag'i alır.                                                                                |
| `title`            | string   | Kısa başlık (max 100 karakter).                                                                                                              |
| `content`          | string   | Markdown/multiline. Asıl bilgi.                                                                                                              |

### 2.2 Opsiyonel alanlar

| Alan              | Tür      | Açıklama                                             |
| ----------------- | -------- | ---------------------------------------------------- |
| `entity`          | string   | İlgili domain entity (chunk type=glossary ise).      |
| `page_id`         | string   | Sayfa kaydı ID (type=page ise).                      |
| `endpoint_id`     | string   | API endpoint ID (type=api ise).                      |
| `permission`      | string   | Permission spec (type=permission ise).               |
| `error_code`      | string   | Hata kodu (type=error ise).                          |
| `confidence`      | enum     | `high` / `medium` / `low`.                           |
| `pii`             | boolean  | Bu chunk PII içeriyor mu? (mask'leme için).          |
| `expires_at`      | ISO 8601 | Geçici bilgi için son kullanma.                      |
| `keywords`        | string[] | Arama için anahtar kelimeler. Locale'e göre değişir. |
| `related_chunks`  | string[] | Diğer ilgili chunk'lar.                              |
| `related_pages`   | string[] | İlgili sayfa kayıtları.                              |
| `related_api`     | string[] | İlgili API endpoint'leri.                            |
| `embedding_model` | string   | Embedding için kullanılan model.                     |

## 3. Chunk Üretim Kuralları

### 3.1 Büyüklük

- **Min:** 50 kelime. Çok kısa chunk'lar retrieval'da faydasız.
- **Max:** 500 kelime. Büyük chunk'lar relevance'ı düşürür.
- **Soft target:** 200-300 kelime (1 paragraf / 1 prosedür adımı).

### 3.2 Bölümleme (Chunking Strategy)

| Kaynak türü  | Bölümleme kuralı                                                         |
| ------------ | ------------------------------------------------------------------------ |
| `glossary`   | Her entity bir chunk. Tanım + ilişkiler + alanlar tek chunk.             |
| `flow`       | Her akış adımı bir chunk. Veya her akış bir chunk (kısa ise).            |
| `field`      | Her alan bir chunk.                                                      |
| `permission` | Her permission bir chunk.                                                |
| `error`      | Her hata kodu bir chunk.                                                 |
| `page`       | Her sayfa kaydı bir chunk (kısa) veya `actions` başına bir chunk (uzun). |
| `api`        | Her endpoint bir chunk.                                                  |

### 3.3 ID Kuralı

- `chunk_id` kaynak dosyaya ve türe göre türetilir.
- Küçük harf, rakam, tire. Noktalama yok.
- Tür prefix: `glossary-`, `flow-`, `field-`, `permission-`, `error-`, `audit-`, `page-`, `api-`, `country-`, `log-standard-`, `pii-rule-`, `correlation-`.
- Aynı ID iki kez kullanılamaz.

## 4. Metadata (RAG Retrieval)

RAG pipeline'ı her chunk için şu metadata'yı indexler:

```ts
interface ChunkMetadata {
  chunk_id: string;
  type: ChunkType;
  source: string;
  locale: "tr-TR" | "en-GB";
  version: string;
  last_verified_at: string;
  confidence: "high" | "medium" | "low";
  pii: boolean;
  keywords: string[];
  // Embedding (1536 boyutlu OpenAI ada-002 varsayılan).
  embedding?: number[];
}
```

**Embedding üretimi:**

1. `content` alanı normalize edilir (küçük harf, noktalama temizliği).
2. `embedding_model` ile vector üretilir.
3. Vector + metadata vector DB'ye (Qdrant / pgvector) yazılır.

## 5. Doğrulama (CI)

`pnpm docs:check` şunları doğrular:

1. **Schema:** Her chunk yukarıdaki şemaya uygun (type check).
2. **Benzersizlik:** `chunk_id` tekrarsız.
3. **Version:** `version` semver formatında.
4. **last_verified_at:** 90 günden eski chunk'lar `degraded` flag'i alır
   (uyarı, hata değil).
5. **Source existence:** `source` dosyası repo'da var mı?
6. **Orphan:** Hiçbir sayfa/akışa referans vermeyen chunk'lar uyarı.
7. **PII:** `pii=true` olan chunk'lar mask'li mi? (regex ile plain text PII kontrolü).
8. **i18n parity:** Aynı chunk_id için tr-TR ve en-GB versiyonları
   var mı? (type, source, entity tutarlı; content farklı olabilir).

## 6. Ingest Pipeline (Faz 11+)

```ts
// apps/api/src/common/ai/ingest.service.ts
import { readFile } from "node:fs/promises";
import yaml from "js-yaml";

import { vectorStore } from "./vector-store.js";
import { embed } from "./embedding.js";

export async function ingestChunks(root: string): Promise<number> {
  const catalogPath = `${root}/docs/ai/AI_CHUNKS.yaml`;
  const text = await readFile(catalogPath, "utf8");
  const chunks = yaml.load(text) as ChunkSpec[];

  let ingested = 0;
  for (const chunk of chunks) {
    const embedding = await embed(chunk.content, chunk.locale);
    await vectorStore.upsert({
      id: `${chunk.locale}:${chunk.chunk_id}`,
      vector: embedding,
      metadata: chunk,
    });
    ingested += 1;
  }
  return ingested;
}
```

## 7. Retrieval Sözleşmesi

AI asistanı bir kullanıcı sorusu aldığında:

```ts
interface RetrieveRequest {
  query: string;
  locale: "tr-TR" | "en-GB";
  context: {
    tenantId: string;
    userId: string;
    role: string;
    currentPage?: string;
    selectedEntity?: string;
  };
  topK?: number; // varsayılan 5
  minScore?: number; // varsayılan 0.7
}

interface RetrieveResponse {
  chunks: Array<{
    chunk_id: string;
    content: string;
    score: number;
    metadata: ChunkMetadata;
  }>;
  query_id: string;
  duration_ms: number;
}
```

## 8. Versiyonlama

Chunk içeriği değiştiğinde:

- **Major** (1.0.0 → 2.0.0): Anlam değişikliği (yeni alan, yeni kural).
- **Minor** (1.0.0 → 1.1.0): Eklenti (yeni örnek, yeni not).
- **Patch** (1.0.0 → 1.0.1): Yazım/format düzeltme.

Aynı `chunk_id` birden fazla versiyonda bulunabilir; vector DB'de
`chunk_id:version` composite key kullanılır. Eski versiyonlar
`superseded_at` ile işaretlenir, 30 gün sonra silinir.

## 9. Erişim Kontrolü

- **Public chunks:** Sayfa kataloğu, alan sözlüğü, hata kataloğu
  → tüm kullanıcılar.
- **Tenant-private chunks:** Tenant'a özel kural, fiyat listesi
  → `tenantId` filtresi uygulanır.
- **Role-restricted chunks:** Finansal rapor, audit log açıklaması
  → `role` filtresi uygulanır.

RAG retrieval, kullanıcının rolüne göre filtreleme yapar.
Yetkisiz chunk retrieval listesine alınmaz.

## 10. Operasyonel Notlar

- **Refresh:** Doküman değiştiğinde CI/CD otomatik ingest job'u
  tetikler. Gecikme hedefi: 5 dakika.
- **Staleness:** 90 günü geçen chunk'lar `degraded` flag'i alır;
  AI asistanı yanıtta "bu bilgi güncellenmemiş olabilir" notu
  ekler.
- **Embedding maliyeti:** ada-002 ile ~$0.0001/1K token. 10K
  chunk için ~$0.20. Günlük re-ingest maliyeti ihmal edilebilir.
- **Latency:** Vector search p95 < 50ms (10K chunk set).
  LLM yanıt süresi p95 < 2s (gpt-4o-mini).

## 11. Örnek Chunk Set

`docs/ai/AI_CHUNKS.yaml` (initial seed) aşağıdaki chunk'ları içerir:

- 18 `glossary` (her domain entity)
- 16 `flow` (her klinik akış)
- 121 `error` (her VET- hata kodu)
- 113 `permission` (her permission)
- 35 `error-module` (her hata modülü açıklaması)
- 5 `audit-event-group` (clinic/petshop/finance/identity/system/security)
- 7 `page` (mevcut web sayfaları)
- 4 `log-standard` (sistem/job/entegrasyon/güvenlik)
- 4 `pii-rule` (ad/e-posta/telefon/vergi)

Toplam: ~325 chunk (initial seed). Faz 11+'da genişletilir.

## İlgili dokümanlar

- [`AI_KNOWLEDGE_BASE.md`](./AI_KNOWLEDGE_BASE.md) — bilgi
  kaynakları haritası.
- [`../pages/PAGE_SCHEMA.md`](../pages/PAGE_SCHEMA.md) — sayfa
  kaydı şeması.
- [`../api/API_SCHEMA.md`](../api/API_SCHEMA.md) — API endpoint
  şeması.
- [`../fields/FIELD_SCHEMA.md`](../fields/FIELD_SCHEMA.md) —
  alan sözlüğü şeması.
- [`../errors/AUDIT_LOG_STANDARD.md`](../errors/AUDIT_LOG_STANDARD.md)
  — audit log referansı.
- [`../errors/ERROR_CATALOG.md`](../errors/ERROR_CATALOG.md) —
  hata kodu referansı.
