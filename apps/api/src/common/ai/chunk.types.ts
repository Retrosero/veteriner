/**
 * @file AI chunk tipleri.
 * @module apps/api/common/ai/chunk.types
 *
 * @description RAG pipeline'ında kullanılan chunk'ların
 * TypeScript tipleri. `docs/ai/CHUNK_SCHEMA.md` ile uyumlu.
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 */

export type ChunkType =
  | "glossary"
  | "flow"
  | "field"
  | "permission"
  | "error"
  | "audit"
  | "page"
  | "api"
  | "country"
  | "log-standard"
  | "pii-rule"
  | "correlation";

export type ChunkLocale = "tr-TR" | "en-GB";

export type ChunkConfidence = "high" | "medium" | "low";

/**
 * RAG chunk metadata.
 */
export interface ChunkMetadata {
  chunk_id: string;
  type: ChunkType;
  source: string;
  locale: ChunkLocale;
  version: string;
  last_verified_at: string;
  confidence?: ChunkConfidence;
  pii?: boolean;
  expires_at?: string | null;
  entity?: string;
  page_id?: string;
  endpoint_id?: string;
  permission?: string;
  error_code?: string;
  keywords: string[];
  related_chunks?: string[];
  related_pages?: string[];
  related_api?: string[];
  title: string;
  content: string;
  embedding?: number[];
  embedding_model?: string;
}

/**
 * Retrieval sonucu.
 */
export interface RetrievedChunk {
  chunk_id: string;
  content: string;
  score: number;
  metadata: ChunkMetadata;
}

/**
 * Retrieval isteği.
 */
export interface RetrieveRequest {
  query: string;
  locale: ChunkLocale;
  context: {
    tenantId: string;
    userId: string;
    role: string;
    currentPage?: string;
    selectedEntity?: string;
  };
  topK?: number;
  minScore?: number;
  /** İsteğe bağlı: sadece belirli chunk türlerinde ara. */
  types?: ChunkType[];
}

/**
 * Retrieval yanıtı.
 */
export interface RetrieveResponse {
  chunks: RetrievedChunk[];
  query_id: string;
  duration_ms: number;
}
