/**
 * @file AI controller unit testleri.
 * @module apps/api/modules/ai/ai.controller.spec
 *
 * @description AiController'ın temel davranışını doğrular.
 * RetrievalService mock'lanır; LLM çağrısı yapılmaz (FAZ-11).
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 * @updated GOAL-115 (FAZ-11) context-aware help endpoint
 */

import { describe, expect, it } from "vitest";

import { AiController } from "./ai.controller.js";
import { RetrievalService } from "../../common/ai/retrieval.service.js";
import { InMemoryVectorStore } from "../../common/ai/in-memory-vector-store.js";
import type { ChunkMetadata } from "../../common/ai/chunk.types.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";

const STAFF: ActorContext = {
  actorId: "usr-staff-test",
  actorType: "user",
  role: "STAFF",
  tenantId: "tnt-test",
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-test",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

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

    const res = await controller.help(
      {
        query: "test sorgu",
        locale: "tr-TR",
        topK: 3,
      },
      STAFF,
    );

    expect(res.query_id).toBeDefined();
    expect(res.duration_ms).toBeGreaterThanOrEqual(0);
    expect(res.sources.length).toBeLessThanOrEqual(3);
    expect(res.answer.length).toBeGreaterThan(0);
  });

  it("empty retrieval için boş sources döner", async () => {
    const retrieval = new RetrievalService(new InMemoryVectorStore());
    const controller = new AiController(retrieval);

    const res = await controller.help(
      {
        query: "kimse yok",
        locale: "tr-TR",
      },
      STAFF,
    );

    expect(res.chunks).toEqual([]);
    expect(res.sources).toEqual([]);
    expect(res.generationSource).toBe("template");
  });

  it("currentPage verilirse context-aware answer üretir", async () => {
    const store = new InMemoryVectorStore();
    const chunk: ChunkMetadata = {
      chunk_id: "test-page",
      type: "page",
      source: "docs/test.md",
      locale: "tr-TR",
      version: "1.0.0",
      last_verified_at: "2026-07-30",
      title: "Test sayfası",
      content: "Sayfa açıklaması içeriği test kelimesi geçen uzun bir paragraf.",
      keywords: ["test", "sayfa"],
    };
    // Aynı token'lar için aynı vektör; query "test" ile match etmesi için.
    const queryWords = "test sayfası içeriği paragraf".split(" ");
    const vec = new Array<number>(256).fill(0);
    for (const word of queryWords) {
      let hash = 0;
      for (let i = 0; i < word.length; i += 1) {
        hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
      }
      vec[hash % 256] = 1;
    }
    await store.upsert(chunk, vec);

    const retrieval = new RetrievalService(store);
    const controller = new AiController(retrieval);

    const res = await controller.help(
      {
        query: "test sayfası içeriği paragraf",
        locale: "tr-TR",
        currentPage: "/[locale]/clinic/test",
        topK: 3,
      },
      STAFF,
    );

    expect(res.chunks.length).toBeGreaterThan(0);
    expect(res.answer).toContain("Test sayfası");
    expect(res.answer).toContain("clinic/test");
  });
});
