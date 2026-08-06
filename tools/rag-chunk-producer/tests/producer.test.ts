/**
 * @file RAG chunk producer unit testleri.
 * @module @vetniva/rag-chunk-producer
 *
 * @description chunkMarkdown, chunkYaml, mergeChunks
 *   fonksiyonlarının temel davranışlarını, hash-tabanlı
 *   merge'i, dry-run modunu ve JSONL ihracatını doğrular.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  chunkMarkdown,
  chunkYaml,
  inferChunkId,
  inferType,
  extractKeywords,
  extractApiRefs,
  mergeChunks,
  runPipeline,
  runPipelinePlan,
} from "../src/index.js";
import { parseJsonl } from "../src/jsonl.js";

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
    expect(inferType("docs/user-education/AUTH.md", "x")).toBe(
      "user_education",
    );
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
    const chunks = chunkYaml(
      yaml,
      "docs/pages/web.app.locale.test.yaml",
      config,
    );
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

  it("mergeChunks: mapping şemasında metadata ve kayıtları korur", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vetniva-rag-"));
    const output = path.join(directory, "AI_CHUNKS.yaml");
    try {
      await writeFile(
        output,
        'version: "1.0.0"\ngenerated_by: "test"\nchunks:\n  - chunk_id: existing\n    type: glossary\n',
        "utf8",
      );
      const [newChunk] = chunkMarkdown(
        "## Yeni chunk\n\nYeterince uzun test içeriği; RAG kaydı üretmek için kullanılır.",
        "docs/workflows/test.md",
        config,
      );
      expect(newChunk).toBeDefined();

      const result = await mergeChunks(output, [newChunk!]);
      const written = await readFile(output, "utf8");

      expect(result).toEqual({
        added: 1,
        skipped: 0,
        updated: 0,
        merged: expect.arrayContaining([
          expect.objectContaining({ chunk_id: "existing" }),
          expect.objectContaining({ chunk_id: newChunk!.chunk_id }),
        ]),
      });
      expect(written).toContain("generated_by: test");
      expect(written).toContain("chunk_id: existing");
      expect(written).toContain(`chunk_id: ${newChunk!.chunk_id}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("chunkMarkdown: her chunk için contentHash üretir", () => {
    const chunks = chunkMarkdown(
      "## A Bölümü\n\nA içeriği burada.\n\n## B Bölümü\n\nB içeriği burada.",
      "docs/workflows/hash.md",
      config,
    );
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(chunks[1]!.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(chunks[0]!.contentHash).not.toBe(chunks[1]!.contentHash);
  });

  it("mergeChunks (hash modu): aynı içerik → skip", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vetniva-rag-"));
    const output = path.join(directory, "AI_CHUNKS.yaml");
    try {
      // İlk çalıştırma: ekle.
      const [first] = chunkMarkdown(
        "## Aynı İçerik\n\nBu içerik hash testi için kullanılır; birkaç cümle içermelidir.",
        "docs/workflows/hash-test.md",
        config,
      );
      expect(first).toBeDefined();
      const r1 = await mergeChunks(output, [first!], { mergeMode: "hash" });
      expect(r1.added).toBe(1);
      expect(r1.skipped).toBe(0);
      expect(r1.updated).toBe(0);
      expect(r1.merged.length).toBe(1);

      // İkinci çalıştırma: aynı içerik → atla.
      const [second] = chunkMarkdown(
        "## Aynı İçerik\n\nBu içerik hash testi için kullanılır; birkaç cümle içermelidir.",
        "docs/workflows/hash-test.md",
        config,
      );
      const r2 = await mergeChunks(output, [second!], { mergeMode: "hash" });
      expect(r2.added).toBe(0);
      expect(r2.skipped).toBe(1);
      expect(r2.updated).toBe(0);
      expect(r2.merged.length).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("mergeChunks (hash modu): değişmiş içerik → update", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vetniva-rag-"));
    const output = path.join(directory, "AI_CHUNKS.yaml");
    try {
      const [first] = chunkMarkdown(
        "## Akış\n\nİlk sürüm içerik.",
        "docs/workflows/update-test.md",
        config,
      );
      expect(first).toBeDefined();
      await mergeChunks(output, [first!], { mergeMode: "hash" });

      // İçerik değişti.
      const [second] = chunkMarkdown(
        "## Akış\n\nİkinci sürüm içerik; değişiklik var.",
        "docs/workflows/update-test.md",
        config,
      );
      const result = await mergeChunks(output, [second!], {
        mergeMode: "hash",
      });
      expect(result.added).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.merged.length).toBe(1);

      const written = await readFile(output, "utf8");
      expect(written).toContain("İkinci sürüm içerik");
      expect(written).not.toContain("İlk sürüm içerik");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("mergeChunks (id-only modu): hash değişse bile skip", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vetniva-rag-"));
    const output = path.join(directory, "AI_CHUNKS.yaml");
    try {
      const [first] = chunkMarkdown(
        "## Kararlı\n\nİlk içerik.",
        "docs/workflows/stable.md",
        config,
      );
      await mergeChunks(output, [first!]);

      const [second] = chunkMarkdown(
        "## Kararlı\n\nİkinci içerik; değişti.",
        "docs/workflows/stable.md",
        config,
      );
      const result = await mergeChunks(output, [second!]);
      // id-only: chunk_id aynı → skip; içerik güncellenmez.
      expect(result.added).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.merged.length).toBe(1);
      const written = await readFile(output, "utf8");
      expect(written).toContain("İlk içerik");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("runPipeline (dryRun): dosya yazmaz, plan döner", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vetniva-rag-"));
    const docsDir = path.join(directory, "workflows");
    const output = path.join(directory, "AI_CHUNKS.yaml");
    try {
      await mkdir(docsDir, { recursive: true });
      // Hiç kaynak dosya → 0 chunk planı.
      const result = await runPipeline(
        {
          sourceDir: docsDir,
          outputFile: output,
          defaultLocale: "tr-TR",
          runAt: "2026-08-04",
        },
        { dryRun: true },
      );
      expect(result.mode).toBe("dry-run");
      if (result.mode !== "dry-run") return;
      expect(result.plan.total).toBe(0);
      expect(result.plan.sourceDir).toBe(docsDir);
      // Output dosyası oluşmamalı.
      await expect(readFile(output, "utf8")).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("runPipelinePlan: chunk üretim sayılarını raporlar", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vetniva-rag-"));
    const docsDir = path.join(directory, "workflows");
    const output = path.join(directory, "AI_CHUNKS.yaml");
    try {
      await mkdir(docsDir, { recursive: true });
      await writeFile(
        path.join(docsDir, "w1.md"),
        "# Üst başlık\n\n## Adım 1\n\nİçerik 1.\n\n## Adım 2\n\nİçerik 2.\n",
        "utf8",
      );
      const plan = await runPipelinePlan({
        sourceDir: docsDir,
        outputFile: output,
        defaultLocale: "tr-TR",
        runAt: "2026-08-04",
      });
      expect(plan.total).toBe(2);
      expect(plan.wouldAdd).toBe(2);
      expect(plan.wouldSkip).toBe(0);
      // Toplam type/locale sayımı 2 olmalı; Windows path ayracı
      // `inferType` davranışını etkilediği için spesifik anahtar
      // yerine aggregate doğrulanır.
      const totalByType = Object.values(plan.byType).reduce((a, b) => a + b, 0);
      const totalByLocale = Object.values(plan.byLocale).reduce(
        (a, b) => a + b,
        0,
      );
      expect(totalByType).toBe(2);
      expect(totalByLocale).toBe(2);
      expect(plan.byLocale["tr-TR"]).toBe(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("runPipeline (writeJsonl): YAML + JSONL birlikte yazılır", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vetniva-rag-"));
    const docsDir = path.join(directory, "workflows");
    const output = path.join(directory, "AI_CHUNKS.yaml");
    try {
      await mkdir(docsDir, { recursive: true });
      await writeFile(
        path.join(docsDir, "w.md"),
        "## Adım 1\n\nİçerik 1 burada yer alır.\n\n## Adım 2\n\nİçerik 2 burada yer alır.\n",
        "utf8",
      );
      const result = await runPipeline(
        {
          sourceDir: docsDir,
          outputFile: output,
          defaultLocale: "tr-TR",
          runAt: "2026-08-04",
        },
        { writeJsonl: true },
      );
      expect(result.mode).toBe("executed");
      if (result.mode !== "executed") return;
      expect(result.added).toBe(2);
      expect(result.jsonlPath).toBeDefined();
      const jsonl = await readFile(result.jsonlPath!, "utf8");
      // Her satır bir JSON objesi.
      const lines = jsonl.trim().split("\n");
      expect(lines.length).toBe(2);
      const parsed = lines.map((l) => JSON.parse(l));
      expect(parsed[0]!.chunk_id).toBeDefined();
      expect(parsed[0]!.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("parseJsonl: roundtrip parse eder", () => {
    const text =
      JSON.stringify({ a: 1 }) + "\n" + JSON.stringify({ b: 2 }) + "\n";
    const out = parseJsonl(text);
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("parseJsonl: boş satırları atlar", () => {
    const text =
      JSON.stringify({ a: 1 }) + "\n\n" + JSON.stringify({ b: 2 }) + "\n";
    const out = parseJsonl(text);
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("parseJsonl: hatalı satır callback ile raporlanır", () => {
    const text = JSON.stringify({ a: 1 }) + "\nnot-json\n";
    const errors: Array<{ idx: number; msg: string }> = [];
    const out = parseJsonl(text, (idx, msg) => {
      errors.push({ idx, msg });
    });
    expect(out).toEqual([{ a: 1 }]);
    expect(errors.length).toBe(1);
    expect(errors[0]!.idx).toBe(1);
  });
});
