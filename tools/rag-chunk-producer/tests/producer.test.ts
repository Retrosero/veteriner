/**
 * @file RAG chunk producer unit testleri.
 * @module @vetniva/rag-chunk-producer
 *
 * @description chunkMarkdown, chunkYaml, mergeChunks
 *   fonksiyonlarının temel davranışlarını doğrular.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import { describe, expect, it } from "vitest";

import {
  chunkMarkdown,
  chunkYaml,
  inferChunkId,
  inferType,
  extractKeywords,
  extractApiRefs,
} from "../src/index.js";

const config = {
  sourceDir: "/repo/docs/workflows",
  outputFile: "/repo/docs/ai/AI_CHUNKS.yaml",
  defaultLocale: "tr-TR" as const,
  runAt: "2026-07-31",
};

describe("RAG chunk producer", () => {
  it("inferChunkId: dosya + title'dan üretir", () => {
    const id = inferChunkId(
      "docs/workflows/owner_create.md",
      "Hasta Sahibi Ekleme",
      "flow",
    );
    expect(id).toMatch(/^flow-/);
    expect(id).toContain("owner");
  });

  it("inferType: dosya yoluna göre üretir", () => {
    expect(inferType("docs/workflows/owner_create.md", "x")).toBe("flow");
    expect(inferType("docs/pages/dashboard.yaml", "x")).toBe("page");
    expect(inferType("docs/errors/ERROR_CATALOG.md", "x")).toBe("error");
    expect(inferType("docs/permissions/PERMISSION_CATALOG.yaml", "x")).toBe(
      "permission",
    );
    expect(inferType("docs/fields/FIELD_GLOSSARY.md", "x")).toBe("field");
    expect(inferType("docs/user-education/AUTH.md", "x")).toBe("user_education");
    expect(inferType("docs/domain/DOMAIN_GLOSSARY.md", "x")).toBe("glossary");
  });

  it("extractKeywords: stopword filtreler, max 8", () => {
    const kws = extractKeywords(
      "Hasta Sahibi Ekleme",
      "Hasta sahibi kliniğe gelir ve yeni hayvan kaydı yapılır.",
    );
    expect(kws.length).toBeLessThanOrEqual(8);
    expect(kws.length).toBeGreaterThan(0);
    expect(kws).not.toContain("ve");
  });

  it("extractApiRefs: API yollarını yakalar", () => {
    const refs = extractApiRefs(
      "POST /api/v1/owner/owners ile başla; PATCH /api/v1/owner/owners/{id} ile güncelle.",
    );
    expect(refs).toContain("/api/v1/owner/owners");
    expect(refs).toContain("/api/v1/owner/owners/{id}");
  });

  it("chunkMarkdown: ## başlıkları chunk sınırı yapar", () => {
    const md = `# Başlık

İçerik.

## Birinci bölüm

İçerik 1.

## İkinci bölüm

İçerik 2.
`;
    const chunks = chunkMarkdown(md, "docs/workflows/test.md", config);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.title).toBe("Birinci bölüm");
    expect(chunks[1]!.title).toBe("İkinci bölüm");
    expect(chunks[0]!.content).toContain("İçerik 1");
    expect(chunks[1]!.content).toContain("İçerik 2");
  });

  it("chunkMarkdown: boş bölümleri atlar", () => {
    const md = `##\n\n## Boş değil\n\nİçerik.`;
    const chunks = chunkMarkdown(md, "docs/workflows/test.md", config);
    expect(chunks.length).toBe(1);
  });

  it("chunkYaml: sayfa kataloğundan page chunk üretir", () => {
    const yaml = `
page_id: web.app.locale.test
route: "/[locale]/test"
module: clinic
title_key: test.title
purpose:
  tr-TR: "Test amaç."
  en-GB: "Test purpose."
related_api:
  - "GET /api/v1/test"
`;
    const chunks = chunkYaml(yaml, "docs/pages/web.app.locale.test.yaml", config);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.chunk_id).toBe("web.app.locale.test");
    expect(chunks[0]!.type).toBe("page");
    expect(chunks[0]!.title).toBe("test.title");
    expect(chunks[0]!.content).toContain("Test amaç");
    expect(chunks[0]!.related_api).toContain("GET /api/v1/test");
  });

  it("chunkYaml: parse hatası durumunda boş döner", () => {
    const chunks = chunkYaml("not: valid: yaml: [", "test.yaml", config);
    expect(chunks.length).toBe(0);
  });
});
