/**
 * @file AI chunks scanner testleri.
 * @module @vetniva/docs-check/tests/ai-chunks
 *
 * @description `scanAiChunks` fonksiyonunun şema doğrulama
 * mantığını test eder. Geçerli + hatalı chunk'lar ile.
 */

import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanAiChunks } from "../src/scanners/ai-chunks.js";

let root: string;

async function cleanFixture(): Promise<void> {
  try {
    await unlink(path.join(root, "docs/ai/AI_CHUNKS.yaml"));
  } catch {
    // dosya yoksa sorun değil
  }
}

beforeEach(async () => {
  if (!root) {
    root = await mkdtemp(path.join(tmpdir(), "ai-chunks-"));
    await mkdir(path.join(root, "docs/ai"), { recursive: true });
  } else {
    await cleanFixture();
  }
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("scanAiChunks", () => {
  it("dosya yoksa uyarı verir", async () => {
    const r = await scanAiChunks(root);
    expect(r.chunks).toBe(0);
    expect(r.issues.some((i) => i.message.includes("bulunamadı"))).toBe(true);
  });

  it("geçerli chunk'lar için hata vermez", async () => {
    await writeFile(
      path.join(root, "docs/ai/AI_CHUNKS.yaml"),
      `version: "1.0.0"
chunks:
  - chunk_id: test-chunk
    type: glossary
    source: docs/test.md
    locale: tr-TR
    version: "1.0.0"
    last_verified_at: 2026-07-30
    title: "Test chunk"
    content: "Bu bir test chunk içeriğidir. Yeterli uzunlukta olmalı."
`,
    );
    const r = await scanAiChunks(root);
    expect(r.chunks).toBe(1);
    const errors = r.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  it("eksik chunk_id hatası", async () => {
    await writeFile(
      path.join(root, "docs/ai/AI_CHUNKS.yaml"),
      `chunks:
  - type: glossary
    source: docs/test.md
    locale: tr-TR
    version: "1.0.0"
    last_verified_at: 2026-07-30
    title: "Test"
    content: "Yeterli uzunlukta içerik. Yeterli uzunlukta içerik. Yeterli uzunlukta içerik."
`,
    );
    const r = await scanAiChunks(root);
    expect(
      r.issues.some((i) => i.message.includes("`chunk_id` zorunlu")),
    ).toBe(true);
  });

  it("geçersiz type hatası", async () => {
    await writeFile(
      path.join(root, "docs/ai/AI_CHUNKS.yaml"),
      `chunks:
  - chunk_id: bad-type
    type: invalid
    source: docs/test.md
    locale: tr-TR
    version: "1.0.0"
    last_verified_at: 2026-07-30
    title: "Test"
    content: "Yeterli uzunlukta içerik. Yeterli uzunlukta içerik. Yeterli uzunlukta içerik."
`,
    );
    const r = await scanAiChunks(root);
    expect(
      r.issues.some((i) => i.message.includes("Geçersiz veya eksik `type`")),
    ).toBe(true);
  });

  it("tekrarlayan chunk_id hatası", async () => {
    await writeFile(
      path.join(root, "docs/ai/AI_CHUNKS.yaml"),
      `chunks:
  - chunk_id: dup
    type: glossary
    source: docs/test.md
    locale: tr-TR
    version: "1.0.0"
    last_verified_at: 2026-07-30
    title: "Test 1"
    content: "Yeterli uzunlukta içerik. Yeterli uzunlukta içerik. Yeterli uzunlukta içerik."
  - chunk_id: dup
    type: glossary
    source: docs/test.md
    locale: en-GB
    version: "1.0.0"
    last_verified_at: 2026-07-30
    title: "Test 2"
    content: "Yeterli uzunlukta içerik. Yeterli uzunlukta içerik. Yeterli uzunlukta içerik."
`,
    );
    const r = await scanAiChunks(root);
    expect(
      r.issues.some((i) => i.message.includes("Tekrarlayan chunk_id")),
    ).toBe(true);
  });

  it("90 günden eski chunk degraded uyarısı", async () => {
    await writeFile(
      path.join(root, "docs/ai/AI_CHUNKS.yaml"),
      `chunks:
  - chunk_id: old-chunk
    type: glossary
    source: docs/test.md
    locale: tr-TR
    version: "1.0.0"
    last_verified_at: "2025-01-01"
    title: "Old"
    content: "Yeterli uzunlukta içerik. Yeterli uzunlukta içerik. Yeterli uzunlukta içerik."
`,
    );
    const r = await scanAiChunks(root);
    expect(r.issues.some((i) => i.message.includes("degraded"))).toBe(true);
  });
});
