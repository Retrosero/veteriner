/**
 * @file Vector store soyutlama.
 * @module apps/api/common/ai/vector-store
 *
 * @description Vector DB erişimi için soyut interface. FAZ-0'da
 * in-memory implementasyon; Faz 11+ ile Qdrant / pgvector'a
 * geçecek. `VectorStore` interface'i tüm uygulama boyunca sabit
 * kalır.
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 */

import type { ChunkMetadata, RetrievedChunk } from "./chunk.types.js";

/** NestJS DI token'ı; TypeScript interface'i runtime'da mevcut değildir. */
export const VECTOR_STORE = Symbol("VECTOR_STORE");

/**
 * Vector store sözleşmesi. Tüm implementasyonlar (Qdrant,
 * pgvector, in-memory) bu interface'i uygular.
 */
export interface VectorStore {
  /**
   * Tek chunk ekle veya güncelle. ID: `<locale>:<chunk_id>`.
   */
  upsert(chunk: ChunkMetadata, vector: number[]): Promise<void>;

  /**
   * Top-K en yakın chunk'ı getir.
   */
  query(
    vector: number[],
    options: { topK: number; minScore: number; filter?: ChunkFilter },
  ): Promise<RetrievedChunk[]>;

  /**
   * Tüm chunk'ları listele (test / admin).
   */
  list(filter?: ChunkFilter): Promise<ChunkMetadata[]>;

  /**
   * Tüm store'u temizle.
   */
  clear(): Promise<void>;
}

/**
 * Vector store sorgu filtresi.
 */
export interface ChunkFilter {
  locale?: "tr-TR" | "en-GB";
  types?: string[];
  pii?: boolean;
  chunk_ids?: string[];
}
