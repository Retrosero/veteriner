/**
 * @file AI modülü public API.
 * @module apps/api/common/ai
 *
 * @description AI modülünün DI ve tip export'ları.
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 */

export { RetrievalService } from "./retrieval.service.js";
export { AiModule } from "./ai.module.js";
export { InMemoryVectorStore } from "./in-memory-vector-store.js";
export type { VectorStore, ChunkFilter } from "./vector-store.js";
export type {
  ChunkMetadata,
  ChunkType,
  ChunkLocale,
  ChunkConfidence,
  RetrievedChunk,
  RetrieveRequest,
  RetrieveResponse,
} from "./chunk.types.js";
