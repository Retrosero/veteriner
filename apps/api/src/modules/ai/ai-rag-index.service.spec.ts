/**
 * @file RAG index service unit testleri.
 * @module apps/api/modules/ai/ai-rag-index.service.spec
 *
 * @description AiRagIndexService'in TF-IDF search davranisini
 * izole test eder. In-memory chunk loader inject edilir; gercek
 * dosya sistemine veya Redis'e baglanilmaz.
 *
 * @security Tenant + PII filtrelerinin dogru calistigi, role
 *   filtresinin yetkisiz rolleri reddettigi dogrulanir.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk pipeline + web index
 */

import { describe, expect, it } from "vitest";

import { AiRagIndexService } from "./ai-rag-index.service.js";
import { AiChunkLoader, type LoadedChunk } from "../../common/ai/ai-chunk-loader.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

const SUPERADMIN: ActorContext = {
  actorId: "usr-super-test",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: "tnt-test",
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-test",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

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

const VET: ActorContext = {
  ...STAFF,
  actorId: "usr-vet-test",
  role: "VETERINARIAN",
};

/**
 * In-memory loader. AI_CHUNKS.yaml yerine sabit chunk listesi
 * kullanir; dosya sistemi gerektirmez.
 */
function makeLoader(
  chunks: Array<{
    chunk_id: string;
    type?: string;
    title: string;
    content: string;
    locale?: "tr-TR" | "en-GB";
    keywords?: string[];
    source?: string;
    pii?: boolean;
    tenantId?: string | null;
  }>,
): AiChunkLoader {
  const normalized: LoadedChunk[] = chunks.map((c) => ({
    chunk_id: c.chunk_id,
    type: c.type ?? "glossary",
    title: c.title,
    content: c.content,
    locale: c.locale ?? "tr-TR",
    keywords: c.keywords ?? [],
    source: c.source ?? "docs/test.md",
    pii: c.pii ?? false,
    tenantId: c.tenantId ?? null,
  }));
  return new AiChunkLoader("/tmp/vetniva-fake-AI_CHUNKS.yaml", normalized);
}

describe("AiRagIndexService", () => {
  it("bos indeks icin empty source doner", async () => {
    const loader = makeLoader([]);
    const svc = new AiRagIndexService(loader);
    const res = await svc.search("aşı", "tr-TR", SUPERADMIN);
    expect(res.results).toEqual([]);
    expect(res.totalChunks).toBe(0);
    expect(res.source).toBe("empty");
  });

  it("2 karakterden kisa sorguyu reddeder (empty result)", async () => {
    const loader = makeLoader([
      {
        chunk_id: "test-1",
        title: "Aşı Kaydı",
        content: "Aşı uygulaması kaydetme adımları.",
      },
    ]);
    const svc = new AiRagIndexService(loader);
    const res = await svc.search("a", "tr-TR", SUPERADMIN);
    expect(res.results).toEqual([]);
  });

  it("coklu chunk arasinda dogru sonucu one cikarir (scoring)", async () => {
    const loader = makeLoader([
      {
        chunk_id: "owner-1",
        title: "Hasta Sahibi Ekleme",
        content: "Yeni bir hasta sahibi kayit etmek icin adimlar.",
        keywords: ["sahip", "kayit"],
      },
      {
        chunk_id: "vaccine-1",
        title: "Asi Kaydi",
        content: "Bir hayvana asi uygulamasi kaydetme adimlari.",
        keywords: ["asi", "kayit", "uygulama"],
      },
      {
        chunk_id: "appointment-1",
        title: "Randevu Olusturma",
        content: "Telefon veya portal uzerinden randevu alma adimlari.",
        keywords: ["randevu", "olusturma"],
      },
    ]);
    const svc = new AiRagIndexService(loader);
    const res = await svc.search("asi kaydi", "tr-TR", SUPERADMIN);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0]!.chunk_id).toBe("vaccine-1");
    // Skor 0-1 normalize.
    expect(res.results[0]!.score).toBeLessThanOrEqual(1);
    expect(res.results[0]!.score).toBeGreaterThan(0);
  });

  it("eslesen terimleri matchedTerms olarak raporlar", async () => {
    const loader = makeLoader([
      {
        chunk_id: "x-1",
        title: "Asi Kayit",
        content: "Asi uygulama detaylari burada.",
        keywords: ["asi"],
      },
    ]);
    const svc = new AiRagIndexService(loader);
    const res = await svc.search("asi", "tr-TR", SUPERADMIN);
    expect(res.results.length).toBe(1);
    expect(res.results[0]!.matchedTerms).toContain("asi");
  });

  it("PII chunk sadece yetkili rollere (SUPERADMIN/OWNER/VET) acik", async () => {
    const loader = makeLoader([
      {
        chunk_id: "pii-1",
        title: "Hasta Kaydi",
        content: "TC kimlik numarasi iceren kayit.",
        pii: true,
      },
      {
        chunk_id: "public-1",
        title: "Genel Kayit",
        content: "Public dokuman.",
        pii: false,
      },
    ]);
    const svc = new AiRagIndexService(loader);

    const staffRes = await svc.search("kayit", "tr-TR", STAFF);
    const staffIds = staffRes.results.map((r) => r.chunk_id);
    expect(staffIds).toContain("public-1");
    expect(staffIds).not.toContain("pii-1");

    const vetRes = await svc.search("kayit", "tr-TR", VET);
    const vetIds = vetRes.results.map((r) => r.chunk_id);
    expect(vetIds).toContain("pii-1");
    expect(vetIds).toContain("public-1");

    const superRes = await svc.search("kayit", "tr-TR", SUPERADMIN);
    const superIds = superRes.results.map((r) => r.chunk_id);
    expect(superIds).toContain("pii-1");
  });

  it("tenant filtresi: farkli tenant chunk filtrelenir", async () => {
    const loader = makeLoader([
      {
        chunk_id: "tnt-a",
        title: "Test chunk",
        content: "Test icerigi",
        tenantId: "tnt-a",
      },
      {
        chunk_id: "tnt-b",
        title: "Test chunk",
        content: "Test icerigi",
        tenantId: "tnt-b",
      },
      {
        chunk_id: "system",
        title: "System chunk",
        content: "Test icerigi",
        tenantId: null,
      },
    ]);
    const svc = new AiRagIndexService(loader);
    const res = await svc.search("test", "tr-TR", {
      ...SUPERADMIN,
      tenantId: "tnt-a",
    });
    const ids = res.results.map((r) => r.chunk_id);
    expect(ids).toContain("tnt-a");
    expect(ids).toContain("system");
    expect(ids).not.toContain("tnt-b");
  });

  it("locale filtresi sadece tr-TR doner", async () => {
    const loader = makeLoader([
      {
        chunk_id: "tr-1",
        title: "Asi Kaydi",
        content: "Asi uygulama detaylari.",
        locale: "tr-TR",
      },
      {
        chunk_id: "en-1",
        title: "Vaccine Record",
        content: "Vaccine application details.",
        locale: "en-GB",
      },
    ]);
    const svc = new AiRagIndexService(loader);
    const res = await svc.search("asi", "tr-TR", SUPERADMIN);
    const ids = res.results.map((r) => r.chunk_id);
    expect(ids).toContain("tr-1");
    expect(ids).not.toContain("en-1");
  });

  it("topK sinirini uygular", async () => {
    const loader = makeLoader(
      Array.from({ length: 20 }, (_, i) => ({
        chunk_id: `chunk-${i}`,
        title: `Test Chunk ${i}`,
        content: "Asi uygulama detaylari ve diger bilgiler.",
        keywords: ["asi", "test"],
      })),
    );
    const svc = new AiRagIndexService(loader);
    const res = await svc.search("asi", "tr-TR", SUPERADMIN, 3);
    expect(res.results.length).toBe(3);
  });

  it("invalidate cache'i temizler", async () => {
    const chunks: LoadedChunk[] = [
      {
        chunk_id: "x-1",
        type: "glossary",
        title: "Test",
        content: "Test content",
        locale: "tr-TR",
        keywords: [],
        source: "docs/test.md",
        pii: false,
        tenantId: null,
      },
    ];
    const loader = new AiChunkLoader("/tmp/x", chunks);
    const svc = new AiRagIndexService(loader);
    expect((await svc.totalChunks())).toBe(1);
    svc.invalidate();
    // Invalidate sonrasi cache temizlenmis olmali. `cache` private bir
    // alandir; test amacli erisim kasitli olarak `any` uzerinden yapilir
    // (yalnizca bu test satirinda).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    expect((loader as any).cache.length).toBe(0);
  });

  it("snippet ilk 200 karakteri icerir", async () => {
    const longContent = "A".repeat(250);
    const loader = makeLoader([
      { chunk_id: "x-1", title: "Test", content: longContent },
    ]);
    const svc = new AiRagIndexService(loader);
    const res = await svc.search("test", "tr-TR", SUPERADMIN);
    expect(res.results[0]!.snippet.length).toBe(200);
  });
});
