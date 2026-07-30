/**
 * @file Retrieval service.
 * @module apps/api/common/ai/retrieval.service
 *
 * @description RAG retrieval servisi. Kullanıcı sorusunu
 * alır, embedding üretir, vector store'dan en ilgili
 * chunk'ları getirir. LLM çağrısı burada YAPILMAZ; yalnızca
 * retrieval. LLM çağrısı (Faz 11+) HelpService'te olacak.
 *
 * FAZ-0 iskeleti: in-memory vector store + basit embedding
 * (token overlap). Gerçek embedding (OpenAI ada-002) Faz 11+.
 *
 * @security Tenant filtreleme: retrieval sonuçları yalnızca
 *   kullanıcının tenantId'sine uygun chunk'ları döner.
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  RetrieveRequest,
  RetrieveResponse,
  RetrievedChunk,
} from "./chunk.types.js";
import { InMemoryVectorStore } from "./in-memory-vector-store.js";
import type { VectorStore } from "./vector-store.js";

/**
 * RetrievalService. Vector store + basit retrieval.
 * Tenant filtreleme `tenantId` üzerinden yapılır (Faz 11+).
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly store: VectorStore;

  constructor(store?: VectorStore) {
    this.store = store ?? new InMemoryVectorStore();
  }

  /**
   * Soruya en uygun chunk'ları getir. FAZ-0'da basit
   * token-overlap tabanlı "embedding" kullanılır; Faz 11+
   * ile OpenAI ada-002 / cohere / voyage embedding'i entegre
   * edilecek.
   */
  public async retrieve(request: RetrieveRequest): Promise<RetrieveResponse> {
    const start = Date.now();
    const topK = request.topK ?? 5;
    const minScore = request.minScore ?? 0.1;

    const queryVector = naiveEmbed(request.query);
    const chunks = await this.store.query(queryVector, {
      topK,
      minScore,
      filter: { locale: request.locale },
    });

    // Tenant filtresi (FAZ-0'da no-op; Faz 11+'da metadata
    // `tenantId` alanına göre filtreleme yapacak).
    const filtered = chunks.filter((c) => matchesTenant(c, request.context.tenantId));

    return {
      chunks: filtered,
      query_id: randomUUID(),
      duration_ms: Date.now() - start,
    };
  }

  /**
   * Test/admin için store'a doğrudan erişim.
   */
  public getStore(): VectorStore {
    return this.store;
  }
}

function matchesTenant(_chunk: RetrievedChunk, _tenantId: string): boolean {
  // TODO(GOAL-011+): tenant_id metadata'sı eklenince burada filtrele.
  return true;
}

/**
 * Basit embedding: token overlap (kelime bazlı). 256 boyutlu
 * sabit vektör. Production'da OpenAI ada-002 (1536 dim) kullanılacak.
 */
function naiveEmbed(text: string): number[] {
  const vec = new Array<number>(256).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  for (const tok of tokens) {
    let hash = 0;
    for (let i = 0; i < tok.length; i += 1) {
      hash = (hash * 31 + tok.charCodeAt(i)) >>> 0;
    }
    const idx = hash % vec.length;
    vec[idx] = (vec[idx] ?? 0) + 1;
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vec.length; i += 1) {
      vec[i] = (vec[i] ?? 0) / norm;
    }
  }
  return vec;
}
