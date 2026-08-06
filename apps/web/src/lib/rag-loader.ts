/**
 * @file RAG chunk loader (FAZ-12+ retrieval planı için iskelet).
 * @module @vetniva/web/lib/rag-loader
 * @description `tools/rag-chunk-producer` çıktısı olan
 *   `docs/ai/AI_CHUNKS.jsonl` dosyasını web tarafında
 *   okuyacak loader için sözleşme ve minimal stub.
 *
 *   Faz 11'de henüz vektör DB yok; loader yalnızca dosyayı
 *   parse edip `ProducedChunk[]` döner. Faz 12+ ile
 *   `loadRagChunks`:
 *   1. JSONL dosyasını build sırasında veya runtime'da
 *      indirir/cache'ler.
 *   2. OpenAI `text-embedding-3-small` (1536 dim) veya
 *      Cohere `embed-multilingual-v3` (1024 dim) ile
 *      chunk başına embedding üretir.
 *   3. Qdrant veya pgvector'a yazar.
 *   4. Hybrid search (BM25 + cosine) + RRF (Reciprocal
 *      Rank Fusion) ile retrieval yapar.
 *
 *   Bu stub yalnızca sözleşmeyi sabitler. Gerçek
 *   implementasyon Faz 12+ kapsamındadır.
 *
 * @security JSONL içeriği build artefact'tır; PII içeren
 *   chunk'lar `chunk.pii === true` olarak işaretlidir.
 *   Retrieval sırasında tenant filtresi (RLS) ve PII
 *   filtresi uygulanmalıdır. Loader PII'yi mask'lemez;
 *   sadece filtre uygular.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

/* --------------------------------------------------------------------------
 * Tipler
 * --------------------------------------------------------------------------
 */

/** Producer'ın ürettiği `contentHash` öneki. */
export const RAG_HASH_PREFIX = "sha256:" as const;

/** Web tarafında ihtiyaç duyulan minimum chunk görünümü.
 *  Producer'daki `ProducedChunk` ile aynı alanları taşır;
 *  burada kopyalanmasının sebebi bağımsız deployable
 *  olmasıdır (web paketinin producer'a doğrudan
 *  bağımlılığı yok). */
export interface RagChunk {
  chunk_id: string;
  type: string;
  source: string;
  entity: string;
  locale: "tr-TR" | "en-GB";
  version: string;
  last_verified_at: string;
  confidence: "high" | "medium" | "low";
  pii: boolean;
  title: string;
  content: string;
  keywords: string[];
  related_chunks: string[];
  related_pages: string[];
  related_api: string[];
  contentHash?: string;
}

/** Loader konfigürasyonu. */
export interface RagLoaderConfig {
  /** JSONL dosya URL'i (build-time göreli veya runtime
   *  absolute). Default: `/ai/AI_CHUNKS.jsonl` (Next.js
   *  `public/` dizininden servis edilir). */
  jsonlUrl?: string;
  /** `fetch` implementasyonu (test için mock'lanabilir). */
  fetchImpl?: typeof fetch;
  /** Cache süresi (ms). Default: 5 dakika. Build-time
   *  prefetch için uzun tutulabilir. */
  cacheTtlMs?: number;
}

/** Loader sonucu. */
export interface RagLoadResult {
  chunks: RagChunk[];
  /** Toplam chunk sayısı (chunks.length ile aynı). */
  total: number;
  /** Veri tipine göre dağılım. */
  byType: Record<string, number>;
  /** Locale'a göre dağılım. */
  byLocale: Record<string, number>;
  /** Yükleme zamanı (ms). */
  durationMs: number;
  /** Verinin alındığı kaynak URL. */
  source: string;
  /** Cache durumu. */
  fromCache: boolean;
}

/* --------------------------------------------------------------------------
 * Basit in-memory cache
 * --------------------------------------------------------------------------
 */

interface CacheEntry {
  result: RagLoadResult;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

function nowMs(): number {
  return Date.now();
}

/** Test ve geliştirme için cache'i temizler. */
export function clearRagCache(): void {
  cache = null;
}

/* --------------------------------------------------------------------------
 * JSONL parser (Next.js tarafı bağımsız çalışır)
 * --------------------------------------------------------------------------
 */

/**
 * JSONL metnini parse edip `RagChunk[]` döner. Hatalı
 * satırlar yutulur (atlanır); JSONL üreticisi tarafında
 * doğrulama yapıldığı için prodüksiyon verisinde hata
 * beklenmez.
 *
 * @param text JSONL dosya içeriği.
 * @returns Parse edilmiş chunk listesi.
 */
export function parseRagJsonl(text: string): RagChunk[] {
  const out: RagChunk[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(line) as RagChunk;
      out.push(parsed);
    } catch {
      // Bozuk satır → atla. Üretimde gürültüyü önlemek
      // için uyarı loglanmaz; ancak hata oranı yüksek
      // olursa FAZ-12+ telemetry ile raporlanır.
    }
  }
  return out;
}

/* --------------------------------------------------------------------------
 * Loader (FAZ-12+ retrieval için stub)
 * --------------------------------------------------------------------------
 */

/**
 * `AI_CHUNKS.jsonl` dosyasını yükler, parse eder ve
 * basit istatistiklerle döner. Bu implementasyon FAZ-11
 * kapsamında yalnızca dosya okuma + parse yapar; vektör
 * DB entegrasyonu, embedding üretimi ve search
 * implementasyonu Faz 12+'da eklenir.
 *
 * Hata durumları:
 * - HTTP hatası: `Error` fırlatır (message: "RAG loader
 *   HTTP hatası: <status>").
 * - Parse hatası: satır atlanır, sonuç kısmi olabilir.
 * - Boş dosya: `chunks: []` döner.
 *
 * @param config Yükleme konfigürasyonu.
 * @returns Loader sonucu.
 */
export async function loadRagChunks(
  config: RagLoaderConfig = {},
): Promise<RagLoadResult> {
  const url = config.jsonlUrl ?? "/ai/AI_CHUNKS.jsonl";
  const fetchImpl = config.fetchImpl ?? fetch;
  const cacheTtl = config.cacheTtlMs ?? 5 * 60 * 1000;
  const start = nowMs();

  // Cache kontrolü.
  if (cache && cache.expiresAt > start) {
    return { ...cache.result, fromCache: true };
  }

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `RAG loader HTTP hatası: ${response.status} ${response.statusText} (url=${url})`,
    );
  }
  const text = await response.text();
  const chunks = parseRagJsonl(text);

  const byType: Record<string, number> = {};
  const byLocale: Record<string, number> = {};
  for (const chunk of chunks) {
    byType[chunk.type] = (byType[chunk.type] ?? 0) + 1;
    byLocale[chunk.locale] = (byLocale[chunk.locale] ?? 0) + 1;
  }

  const result: RagLoadResult = {
    chunks,
    total: chunks.length,
    byType,
    byLocale,
    durationMs: nowMs() - start,
    source: url,
    fromCache: false,
  };
  cache = { result, expiresAt: start + cacheTtl };
  return result;
}

/**
 * Verilen locale için filtrelenmiş chunk listesi döner.
 * Arama/embedding sözleşmesinin ilkel versiyonu; gerçek
 * FAZ-12+ retrieval bu fonksiyon üzerine kurulur.
 *
 * @param chunks Kaynak chunk listesi.
 * @param locale İstenen locale (`tr-TR` veya `en-GB`).
 * @returns Filtrelenmiş chunk listesi.
 */
export function filterByLocale(
  chunks: ReadonlyArray<RagChunk>,
  locale: "tr-TR" | "en-GB",
): RagChunk[] {
  return chunks.filter((c) => c.locale === locale);
}

/**
 * PII içermeyen chunk'ları filtreler. SUPERADMIN
 * dışındaki UI'lar için kullanılacak. SUPERADMIN yine de
 * tümünü görmek isterse `filterByLocale` + manuel
 * `pii` filtresi uygulayabilir.
 *
 * @param chunks Kaynak chunk listesi.
 * @returns PII=false olan chunk'lar.
 */
export function filterPiiSafe(chunks: ReadonlyArray<RagChunk>): RagChunk[] {
  return chunks.filter((c) => c.pii === false);
}

/**
 * Verilen sorguya basit anahtar kelime eşleşmesi yapar.
 * `content`, `title`, `keywords` alanlarında geçen
 * kelimelerle skorlar; FAZ-12+ ile vektör cosine
 * similarity + RRF burada birleştirilecek.
 *
 * @param chunks Kaynak chunk listesi.
 * @param query Kullanıcı sorusu (locale'a uygun).
 * @param topK En fazla kaç sonuç.
 * @returns Skor sırasına göre `topK` chunk.
 */
export function keywordSearch(
  chunks: ReadonlyArray<RagChunk>,
  query: string,
  topK: number = 5,
): Array<{ chunk: RagChunk; score: number }> {
  const q = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2);
  if (q.length === 0) return [];
  const scored: Array<{ chunk: RagChunk; score: number }> = [];
  for (const chunk of chunks) {
    const haystack =
      `${chunk.title} ${chunk.content} ${chunk.keywords.join(" ")}`.toLowerCase();
    let score = 0;
    for (const term of q) {
      if (haystack.includes(term)) score += 1;
    }
    if (score > 0) {
      scored.push({ chunk, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
