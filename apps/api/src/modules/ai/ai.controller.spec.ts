/**
 * @file AI controller unit testleri.
 * @module apps/api/modules/ai/ai.controller.spec
 *
 * @description AiController'ın temel davranışını doğrular.
 * RetrievalService mock'lanır; LLM çağrısı yapılmaz (FAZ-0).
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 */

import { describe, expect, it } from "vitest";

import { AiController } from "./ai.controller.js";
import { RetrievalService } from "../../common/ai/retrieval.service.js";
import { InMemoryVectorStore } from "../../common/ai/in-memory-vector-store.js";
import type { ChunkMetadata } from "../../common/ai/chunk.types.js";

describe("AiController", () => {
  it("help endpoint retrieval sonucu döner", async () => {
    const store = new InMemoryVectorStore();
    const chunk: ChunkMetadata = {
      chunk_id: "test-flow",
      type: "flow",
      source: "docs/test.md",
      locale: "tr-TR",
      version: "1.0.0",
      last_verified_at: "2026-07-30",
      title: "Test akış",
      content: "Test akış içeriği. Yeterli uzunlukta. Yeterli uzunlukta.",
      keywords: ["test", "akış"],
    };
    const vec = new Array<number>(256).fill(0);
    vec[10] = 1;
    await store.upsert(chunk, vec);

    const retrieval = new RetrievalService(store);
    const controller = new AiController(retrieval);

    const res = await controller.help({
      query: "test sorgu",
      locale: "tr-TR",
      topK: 3,
    });

    expect(res.query_id).toBeDefined();
    expect(res.duration_ms).toBeGreaterThanOrEqual(0);
    expect(res.sources.length).toBeLessThanOrEqual(3);
  });

  it("empty retrieval için boş sources döner", async () => {
    const retrieval = new RetrievalService(new InMemoryVectorStore());
    const controller = new AiController(retrieval);

    const res = await controller.help({
      query: "x",
      locale: "tr-TR",
    });

    expect(res.chunks).toEqual([]);
    expect(res.sources).toEqual([]);
  });
});
