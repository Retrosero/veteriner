/**
 * @file RAG index DI token'lari.
 * @module apps/api/modules/ai/ai-rag-index.tokens
 *
 * @description `AiRagIndexService` için DI token tanımları.
 * Test ortamında in-memory loader inject etmek için kullanılır.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk pipeline + web index
 */

import type { AiChunkLoader } from "../../common/ai/ai-chunk-loader.service.js";

/**
 * AI chunk loader provider token. `AiRagIndexService` bu token
 * üzerinden loader alır; üretimde default singleton, testte
 * stub kullanılır.
 */
export const CHUNK_LOADER = Symbol.for("vetniva.ai.chunk_loader");

/**
 * DI token tipleri (type guard için).
 */
export type ChunkLoaderToken = typeof CHUNK_LOADER;

/**
 * Type-safe provider factory.
 */
export type ChunkLoaderProvider = {
  provide: ChunkLoaderToken;
  useValue: AiChunkLoader;
};
