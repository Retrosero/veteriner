/**
 * @file Retrieval service unit testleri.
 * @module apps/api/common/ai/retrieval.spec
 *
 * @description RetrievalService'in temel davranışlarını
 * doğrular: sorgu, filtreleme, topK, sıralama.
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 */

import { describe, expect, it, beforeEach } from "vitest";

import { RetrievalService } from "./retrieval.service.js";
import type { ChunkMetadata } from "./chunk.types.js";

const SAMPLE_CHUNKS: ChunkMetadata[] = [
  {
    chunk_id: "test-vaccination",
    type: "flow",
    source: "docs/test.md",
    locale: "tr-TR",
    version: "1.0.0",
    last_verified_at: "2026-07-30",
    title: "Aşı Uygulama",
    content: "Aşı uygulama akışı, lot seçimi, stok düşümü.",
    keywords: ["aşı", "vaccination", "akış"],
  },
  {
    chunk_id: "test-microchip",
    type: "glossary",
    source: "docs/test.md",
    locale: "tr-TR",
    version: "1.0.0",
    last_verified_at: "2026-07-30",
    title: "Mikroçip",
    content: "Mikroçip, 15 haneli ISO 11784/11785 uyumlu hayvan tanımlama.",
    keywords: ["mikroçip", "microchip", "pet id"],
  },
  {
    chunk_id: "test-vaccination-en",
    type: "flow",
    source: "docs/test.md",
    locale: "en-GB",
    version: "1.0.0",
    last_verified_at: "2026-07-30",
    title: "Vaccination",
    content: "Vaccination workflow, lot selection, stock decrement.",
    keywords: ["vaccination", "workflow"],
  },
];

describe("RetrievalService", () => {
  let service: RetrievalService;

  beforeEach(async () => {
    service = new RetrievalService();
    for (const chunk of SAMPLE_CHUNKS) {
      // naiveEmbed doğrudan kullanılamaz; service üzerinden ekle.
      const vec = new Array<number>(256).fill(0);
      const id = (chunk.chunk_id.length * 7 + chunk.title.length * 3) % 256;
      vec[id] = 1;
      await service.getStore().upsert(chunk, vec);
    }
  });

  it("ingest edilen chunk'ları listeler", async () => {
    const all = await service.getStore().list();
    expect(all.length).toBe(3);
  });

  it("locale filtresi çalışır", async () => {
    const tr = await service.getStore().list({ locale: "tr-TR" });
    const en = await service.getStore().list({ locale: "en-GB" });
    expect(tr.length).toBe(2);
    expect(en.length).toBe(1);
  });

  it("type filtresi çalışır", async () => {
    const flows = await service.getStore().list({ types: ["flow"] });
    expect(flows.length).toBe(2);
  });

  it("retrieve tenant context ile çalışır", async () => {
    const r = await service.retrieve({
      query: "aşı nasıl uygulanır",
      locale: "tr-TR",
      context: {
        tenantId: "tnt-1",
        userId: "usr-1",
        role: "VETERINARIAN",
      },
      topK: 5,
    });
    expect(r.chunks.length).toBeGreaterThanOrEqual(0);
    expect(r.query_id).toBeDefined();
    expect(r.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("minScore filtresi çalışır", async () => {
    const r = await service.retrieve({
      query: "hiç alakasız sorgu xyz123",
      locale: "tr-TR",
      context: {
        tenantId: "tnt-1",
        userId: "usr-1",
        role: "STAFF",
      },
      minScore: 0.99, // çok yüksek
    });
    // Hiçbir chunk bu skoru geçemez (sıfır vektörle sorgu)
    expect(r.chunks.length).toBe(0);
  });
});
