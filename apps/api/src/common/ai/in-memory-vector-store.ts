/**
 * @file In-memory vector store (FAZ-0 iskeleti).
 * @module apps/api/common/ai/in-memory-vector-store
 * @description FAZ-0 için basit in-memory implementasyon.
 * Gerçek vector DB (Qdrant / pgvector) Faz 11+ ile entegre
 * edilecek. Bu implementasyon, arayüz sözleşmesini
 * karşılar; test ve geliştirme için yeterlidir.
 *
 * Cosine similarity ile basit arama yapar. Üretim için
 * yeterli değildir (ölçeklenebilirlik, kalıcılık, gözlem
 * yok).
 * GOAL-005 (Faz 0) dokümantasyon ve AI bilgi havuzu sözleşmesini destekler.
 */

import type { ChunkMetadata, RetrievedChunk } from "./chunk.types.js";
import type { ChunkFilter, VectorStore } from "./vector-store.js";

interface StoredVector {
  id: string;
  chunk: ChunkMetadata;
  vector: number[];
}

export class InMemoryVectorStore implements VectorStore {
  private readonly store: Map<string, StoredVector> = new Map();

  public upsert(chunk: ChunkMetadata, vector: number[]): Promise<void> {
    const id = `${chunk.locale}:${chunk.chunk_id}`;
    this.store.set(id, { id, chunk, vector });
    return Promise.resolve();
  }

  public query(
    vector: number[],
    options: { topK: number; minScore: number; filter?: ChunkFilter },
  ): Promise<RetrievedChunk[]> {
    const candidates: { entry: StoredVector; score: number }[] = [];
    for (const entry of this.store.values()) {
      if (!matchesFilter(entry.chunk, options.filter)) continue;
      const score = cosineSimilarity(vector, entry.vector);
      if (score >= options.minScore) {
        candidates.push({ entry, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return Promise.resolve(
      candidates.slice(0, options.topK).map(({ entry, score }) => ({
        chunk_id: entry.chunk.chunk_id,
        content: entry.chunk.content,
        score,
        metadata: entry.chunk,
      })),
    );
  }

  public list(filter?: ChunkFilter): Promise<ChunkMetadata[]> {
    const out: ChunkMetadata[] = [];
    for (const entry of this.store.values()) {
      if (matchesFilter(entry.chunk, filter)) out.push(entry.chunk);
    }
    return Promise.resolve(out);
  }

  public clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }
}

/**
 * Chunk'ın verilen filtreyi karşılayıp karşılamadığını doğrular.
 * @param {object} chunk Değerlendirilecek chunk metadatası.
 * @param {object} filter Uygulanacak isteğe bağlı filtre.
 * @returns {boolean} Chunk filtreyi karşılıyorsa `true`.
 */
function matchesFilter(chunk: ChunkMetadata, filter?: ChunkFilter): boolean {
  if (!filter) return true;
  if (filter.locale && chunk.locale !== filter.locale) return false;
  if (filter.types && !filter.types.includes(chunk.type)) return false;
  if (filter.pii !== undefined && chunk.pii !== filter.pii) return false;
  if (filter.chunk_ids && !filter.chunk_ids.includes(chunk.chunk_id)) {
    return false;
  }
  return true;
}

/**
 * Cosine similarity. 0-1 aralığında (normalize vektörler için).
 * 0 = ortogonal, 1 = aynı yön, -1 = zıt yön.
 * @param {number[]} a İlk vektör.
 * @param {number[]} b İkinci vektör.
 * @returns {number} İki vektörün kosinüs benzerlik skoru.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a.at(i) ?? 0;
    const bi = b.at(i) ?? 0;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}
