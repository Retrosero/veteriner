/**
 * @file RAG index servisi (in-memory TF-IDF search).
 * @module apps/api/modules/ai/ai-rag-index.service
 *
 * @description `docs/ai/AI_CHUNKS.yaml` üzerinde basit keyword
 * tabanlı arama sağlar. Üretim için vector DB planı
 * `docs/operations/RAG_CHUNK_PIPELINE.md` içinde tanımlıdır.
 * GOAL-116 (FAZ-11).
 *
 * TF-IDF benzeri algoritma:
 * 1. Query + chunk content token'lara ayrılır.
 * 2. Her token için IDF = log(N / (1 + df)) hesaplanır.
 * 3. Chunk score = sum(token_idf * (1 + log(tf))).
 * 4. Title ve keyword eşleşmeleri bonus ağırlık alır.
 *
 * @security Tenant filtresi: actor.tenantId null ise (pre-auth)
 *   sadece system chunk'ları döner. PII chunk'lar yalnızca
 *   SUPERADMIN/OWNER/VETERINARIAN rollerine açıktır.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk pipeline + web index
 */

import { Inject, Injectable, Logger } from "@nestjs/common";

import { CHUNK_LOADER } from "./ai-rag-index.tokens.js";
import {
  AiChunkLoader,
  defaultChunkLoader,
  type LoadedChunk,
} from "../../common/ai/ai-chunk-loader.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

/**
 * Arama sonucu tek bir chunk.
 */
export interface RagIndexHit {
  chunk_id: string;
  title: string;
  type: string;
  source: string;
  locale: "tr-TR" | "en-GB";
  /** 0-1 normalize edilmiş skor. */
  score: number;
  /** İçeriğin ilk 200 karakteri (snippet). */
  snippet: string;
  pii: boolean;
  matchedTerms: string[];
}

/**
 * Arama yanıtı.
 */
export interface RagIndexSearchResponse {
  query: string;
  locale: "tr-TR" | "en-GB";
  results: RagIndexHit[];
  totalChunks: number;
  duration_ms: number;
  source: "ai_chunks_yaml" | "empty";
}

/**
 * Servis bağımlılıkları (DI için).
 */
export interface RagIndexServiceDeps {
  loader: AiChunkLoader;
}

@Injectable()
export class AiRagIndexService {
  private readonly logger = new Logger(AiRagIndexService.name);
  private readonly loader: AiChunkLoader;

  public constructor(@Inject(CHUNK_LOADER) deps?: AiChunkLoader) {
    this.loader = deps ?? defaultChunkLoader();
  }

  /**
   * AI_CHUNKS.yaml üzerinde arama yapar. Tenant + role + PII
   * filtreleri uygular; sonuçlar skora göre sıralanır.
   * @param query Arama sorgusu (>=2 karakter).
   * @param locale Sonuç dili filtresi.
   * @param actor Aktör bağlamı (tenant + role).
   * @param topK Maks sonuç sayısı (default 10).
   */
  public async search(
    query: string,
    locale: "tr-TR" | "en-GB",
    actor: ActorContext,
    topK: number = 10,
  ): Promise<RagIndexSearchResponse> {
    const start = Date.now();
    const normalizedQuery = this.normalize(query);
    if (normalizedQuery.length < 2) {
      return {
        query,
        locale,
        results: [],
        totalChunks: 0,
        duration_ms: Date.now() - start,
        source: "empty",
      };
    }
    const queryTokens = this.tokenize(normalizedQuery);

    const chunks = await this.loader.load();
    const filtered = this.applyAccessFilter(chunks, actor);

    if (filtered.length === 0) {
      return {
        query,
        locale,
        results: [],
        totalChunks: 0,
        duration_ms: Date.now() - start,
        source: chunks.length === 0 ? "empty" : "ai_chunks_yaml",
      };
    }

    const idf = this.computeIdf(filtered);
    const scored = filtered
      .map((chunk) => ({
        chunk,
        score: this.scoreChunk(chunk, queryTokens, normalizedQuery, idf),
        matchedTerms: this.matchedTerms(chunk, queryTokens),
      }))
      .filter((c) => c.score > 0);

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK);
    const max = top[0]?.score ?? 1;
    const results: RagIndexHit[] = top.map((s) => ({
      chunk_id: s.chunk.chunk_id,
      title: s.chunk.title,
      type: s.chunk.type,
      source: s.chunk.source,
      locale: s.chunk.locale,
      pii: s.chunk.pii,
      snippet: s.chunk.content.slice(0, 200),
      score: max > 0 ? Math.min(1, s.score / max) : 0,
      matchedTerms: s.matchedTerms,
    }));

    return {
      query,
      locale,
      results,
      totalChunks: filtered.length,
      duration_ms: Date.now() - start,
      source: "ai_chunks_yaml",
    };
  }

  /**
   * Cache'i temizler. Worker yeni chunk ürettiğinde API tarafında
   * reload gerekir; testlerde de kullanılır.
   */
  public invalidate(): void {
    this.loader.invalidate();
  }

  /**
   * Toplam indekslenmiş chunk sayısını döner (filtresiz).
   * SUPERADMIN health-check ve metrikler için kullanılır.
   */
  public async totalChunks(): Promise<number> {
    const chunks = await this.loader.load();
    return chunks.length;
  }

  /**
   * Tenant + role + PII filtreleri uygular. Aktör yetkili değilse
   * PII chunk'lar düşer; tenant filtresi `null` olanlar (system
   * chunk'ları) her zaman geçer.
   */
  private applyAccessFilter(
    chunks: LoadedChunk[],
    actor: ActorContext,
  ): LoadedChunk[] {
    const tenantId = actor.tenantId ?? "system";
    const isPrivileged =
      actor.isSuperadmin ||
      actor.role === "OWNER" ||
      actor.role === "VETERINARIAN";
    return chunks.filter((c) => {
      if (c.pii && !isPrivileged) return false;
      if (c.tenantId !== null && c.tenantId !== tenantId) return false;
      return true;
    });
  }

  /**
   * Basit normalize: küçük harf + whitespace trim.
   */
  private normalize(text: string): string {
    return text.toLowerCase().trim();
  }

  /**
   * Tokenizasyon: Unicode harf + rakam token'ları. Stopword
   * filtresi minimal tutulur (4+ karakter).
   */
  private tokenize(text: string): string[] {
    const stopwords = new Set([
      "ve",
      "ile",
      "için",
      "olan",
      "olarak",
      "bu",
      "şu",
      "bir",
      "the",
      "and",
      "for",
      "with",
      "this",
      "that",
      "from",
    ]);
    const tokens = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !stopwords.has(t));
    return Array.from(new Set(tokens));
  }

  /**
   * IDF (Inverse Document Frequency) hesabı. N = toplam chunk
   * sayısı; df = token'ı içeren chunk sayısı.
   */
  private computeIdf(chunks: LoadedChunk[]): Map<string, number> {
    const df = new Map<string, number>();
    for (const chunk of chunks) {
      const text = `${chunk.title} ${chunk.content} ${chunk.keywords.join(" ")}`;
      const tokens = new Set(this.tokenize(text));
      for (const token of tokens) {
        df.set(token, (df.get(token) ?? 0) + 1);
      }
    }
    const idf = new Map<string, number>();
    const N = chunks.length;
    for (const [token, count] of df) {
      idf.set(token, Math.log((N + 1) / (1 + count)) + 1);
    }
    return idf;
  }

  /**
   * Tek bir chunk için skor hesabı. Başlık ve keyword eşleşmeleri
   * 2x ağırlık alır.
   */
  private scoreChunk(
    chunk: LoadedChunk,
    queryTokens: string[],
    rawQuery: string,
    idf: Map<string, number>,
  ): number {
    const haystack =
      `${chunk.title} ${chunk.content} ${chunk.keywords.join(" ")}`.toLowerCase();
    const haystackTokens = this.tokenize(haystack);
    const tf = new Map<string, number>();
    for (const t of haystackTokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    let score = 0;
    for (const qt of queryTokens) {
      const t = tf.get(qt) ?? 0;
      if (t === 0) continue;
      const weight = idf.get(qt) ?? 1;
      score += weight * (1 + Math.log(t));
    }
    // Başlık direkt eşleşmesi bonus.
    if (chunk.title.toLowerCase().includes(rawQuery)) {
      score *= 1.5;
    }
    // Keyword eşleşmeleri bonus.
    const matchedKeywordCount = chunk.keywords.filter((k) =>
      rawQuery.includes(k.toLowerCase()),
    ).length;
    if (matchedKeywordCount > 0) {
      score *= 1 + 0.2 * matchedKeywordCount;
    }
    return score;
  }

  /**
   * Hangi query token'larının chunk ile eşleştiğini döner
   * (UI'da "eşleşen terimler" göstermek için).
   */
  private matchedTerms(chunk: LoadedChunk, queryTokens: string[]): string[] {
    const haystack =
      `${chunk.title} ${chunk.content} ${chunk.keywords.join(" ")}`.toLowerCase();
    return queryTokens.filter((t) => haystack.includes(t));
  }
}
