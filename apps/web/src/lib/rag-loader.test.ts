/**
 * @file RAG loader unit testleri.
 * @module @vetniva/web/lib/rag-loader.test
 * @description `loadRagChunks`, `parseRagJsonl`, `filterByLocale`,
 *   `filterPiiSafe` ve `keywordSearch` fonksiyonlarının davranış
 *   kontratı doğrulanır. FAZ-12+ retrieval için sözleşme
 *   kilidi; vektör DB entegrasyonu Faz 12+'da eklenir.
 *
 * @security Testlerde sentetik PII kullanılır; gerçek
 *   kullanıcı verisi içermez.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import {
  RAG_HASH_PREFIX,
  clearRagCache,
  filterByLocale,
  filterPiiSafe,
  keywordSearch,
  loadRagChunks,
  parseRagJsonl,
  type RagChunk,
} from "./rag-loader";

/** Testlerde kullanılan sentetik chunk fabrikası. */
function makeChunk(overrides: Partial<RagChunk> = {}): RagChunk {
  return {
    chunk_id: "glossary-test",
    type: "glossary",
    source: "docs/domain/test.md",
    entity: "test",
    locale: "tr-TR",
    version: "1.0.0",
    last_verified_at: "2026-08-04",
    confidence: "high",
    pii: false,
    title: "Test Kavram",
    content: "Bu bir test chunk içeriğidir. Hasta sahibi kavramı anlatılır.",
    keywords: ["test", "kavram"],
    related_chunks: [],
    related_pages: [],
    related_api: [],
    contentHash: `${RAG_HASH_PREFIX}abc123`,
    ...overrides,
  };
}

const CHUNKS_JSONL = [
  makeChunk({ chunk_id: "glossary-1" }),
  makeChunk({ chunk_id: "glossary-2", locale: "en-GB" }),
  makeChunk({
    chunk_id: "page-1",
    type: "page",
    pii: true,
    content: "KVKK hassas içerik: hasta sahibi adı.",
  }),
  makeChunk({
    chunk_id: "flow-1",
    type: "flow",
    title: "Aşı Uygulama",
    content: "Aşı uygulaması adımları: önce hayvanı sabitle.",
    keywords: ["aşı", "uygulama"],
  }),
]
  .map((c) => JSON.stringify(c))
  .join("\n");

function makeFetchMock(body: string, status = 200): Mock {
  return vi.fn(async () => {
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  });
}

describe("parseRagJsonl", () => {
  it("her satırı ayrı chunk olarak parse eder", () => {
    const out = parseRagJsonl(CHUNKS_JSONL);
    expect(out.length).toBe(4);
    expect(out[0]!.chunk_id).toBe("glossary-1");
  });

  it("boş satırları atlar", () => {
    const text =
      JSON.stringify(makeChunk({ chunk_id: "a" })) +
      "\n\n" +
      JSON.stringify(makeChunk({ chunk_id: "b" })) +
      "\n";
    expect(parseRagJsonl(text).length).toBe(2);
  });

  it("bozuk satırları yutar (üretim gürültüsünü önler)", () => {
    const text =
      JSON.stringify(makeChunk({ chunk_id: "a" })) +
      "\nnot-json\n" +
      JSON.stringify(makeChunk({ chunk_id: "b" })) +
      "\n";
    const out = parseRagJsonl(text);
    expect(out.length).toBe(2);
    expect(out.map((c) => c.chunk_id)).toEqual(["a", "b"]);
  });
});

describe("loadRagChunks", () => {
  beforeEach(() => {
    clearRagCache();
  });
  afterEach(() => {
    clearRagCache();
  });

  it("JSONL dosyasını yükler, parse eder, istatistikleri üretir", async () => {
    const fetchMock = makeFetchMock(CHUNKS_JSONL);
    const result = await loadRagChunks({
      jsonlUrl: "https://example.test/chunks.jsonl",
      fetchImpl: fetchMock,
      cacheTtlMs: 0,
    });
    expect(result.total).toBe(4);
    expect(result.fromCache).toBe(false);
    expect(result.source).toBe("https://example.test/chunks.jsonl");
    expect(result.byType["glossary"]).toBe(2);
    expect(result.byType["page"]).toBe(1);
    expect(result.byType["flow"]).toBe(1);
    expect(result.byLocale["tr-TR"]).toBe(3);
    expect(result.byLocale["en-GB"]).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cache TTL dolmamışsa ikinci çağrı cache'ten döner", async () => {
    const fetchMock = makeFetchMock(CHUNKS_JSONL);
    const r1 = await loadRagChunks({
      fetchImpl: fetchMock,
      cacheTtlMs: 60_000,
    });
    const r2 = await loadRagChunks({
      fetchImpl: fetchMock,
      cacheTtlMs: 60_000,
    });
    expect(r1.fromCache).toBe(false);
    expect(r2.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("HTTP 404 durumunda Error fırlatır", async () => {
    const fetchMock = makeFetchMock("not found", 404);
    await expect(
      loadRagChunks({ fetchImpl: fetchMock, cacheTtlMs: 0 }),
    ).rejects.toThrow(/RAG loader HTTP hatası: 404/);
  });
});

describe("filterByLocale", () => {
  it("sadece eşleşen locale'daki chunk'ları döner", () => {
    const chunks = [
      makeChunk({ chunk_id: "a", locale: "tr-TR" }),
      makeChunk({ chunk_id: "b", locale: "en-GB" }),
      makeChunk({ chunk_id: "c", locale: "tr-TR" }),
    ];
    const tr = filterByLocale(chunks, "tr-TR");
    expect(tr.map((c) => c.chunk_id)).toEqual(["a", "c"]);
  });
});

describe("filterPiiSafe", () => {
  it("pii=false olan chunk'ları döner; pii=true olanları filtreler", () => {
    const chunks = [
      makeChunk({ chunk_id: "a", pii: false }),
      makeChunk({ chunk_id: "b", pii: true }),
    ];
    const out = filterPiiSafe(chunks);
    expect(out.map((c) => c.chunk_id)).toEqual(["a"]);
  });
});

describe("keywordSearch", () => {
  const chunks = [
    makeChunk({
      chunk_id: "vaccine",
      title: "Aşı Uygulama",
      content: "Aşı uygulaması için önce hayvan sabitlenir.",
      keywords: ["aşı", "uygulama"],
    }),
    makeChunk({
      chunk_id: "owner",
      title: "Hasta Sahibi",
      content: "Hayvan sahibi klinik kaydı oluşturur.",
      keywords: ["sahip", "kayıt"],
    }),
    makeChunk({
      chunk_id: "irrelevant",
      title: "Stok",
      content: "Stok sayımı haftalık yapılır.",
      keywords: ["stok", "sayım"],
    }),
  ];

  it("sorguya uyan chunk'ları skor sırasına göre döner", () => {
    const out = keywordSearch(chunks, "aşı uygulaması", 5);
    expect(out[0]!.chunk.chunk_id).toBe("vaccine");
    expect(out.length).toBeGreaterThan(0);
  });

  it("topK sınırı uygulanır", () => {
    const out = keywordSearch(chunks, "aşı", 1);
    expect(out.length).toBe(1);
  });

  it("çok kısa sorgu terimleri (<3 char) yutulur", () => {
    const out = keywordSearch(chunks, "a b c", 5);
    expect(out.length).toBe(0);
  });

  it("eşleşme yoksa boş döner", () => {
    const out = keywordSearch(chunks, "kedibalığı", 5);
    expect(out.length).toBe(0);
  });
});
