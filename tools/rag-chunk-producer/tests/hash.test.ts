/**
 * @file contentHash unit testleri.
 * @module @vetniva/rag-chunk-producer/hash
 *
 * @description SHA-256 hash fonksiyonunun deterministikliği,
 * normalizasyon tutarlılığı ve çıktı formatı doğrulanır.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import { describe, expect, it } from "vitest";

import { HASH_PREFIX, contentHash } from "../src/hash.js";

describe("contentHash", () => {
  it("aynı girdi için aynı hash üretir", () => {
    const a = contentHash({
      source: "docs/workflows/owner_create.md",
      title: "Hasta Sahibi Ekleme",
      content: "Akış açıklaması burada yer alır.",
    });
    const b = contentHash({
      source: "docs/workflows/owner_create.md",
      title: "Hasta Sahibi Ekleme",
      content: "Akış açıklaması burada yer alır.",
    });
    expect(a).toBe(b);
  });

  it("`sha256:` öneki ile başlar; 64 hex karakter üretir", () => {
    const hash = contentHash({
      source: "x",
      title: "y",
      content: "z",
    });
    expect(hash.startsWith(HASH_PREFIX)).toBe(true);
    const hex = hash.slice(HASH_PREFIX.length);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("whitespace farklılıklarını yok sayar (normalizasyon)", () => {
    const a = contentHash({
      source: "docs/x.md",
      title: "Başlık",
      content: "Bir   satır  içeriği.",
    });
    const b = contentHash({
      source: "docs/x.md",
      title: "  Başlık  ",
      content: "Bir satır içeriği.",
    });
    expect(a).toBe(b);
  });

  it("kaynak (source) değişirse hash de değişir", () => {
    const a = contentHash({
      source: "docs/a.md",
      title: "T",
      content: "C",
    });
    const b = contentHash({
      source: "docs/b.md",
      title: "T",
      content: "C",
    });
    expect(a).not.toBe(b);
  });

  it("başlık (title) değişirse hash de değişir", () => {
    const a = contentHash({
      source: "docs/x.md",
      title: "A",
      content: "C",
    });
    const b = contentHash({
      source: "docs/x.md",
      title: "B",
      content: "C",
    });
    expect(a).not.toBe(b);
  });

  it("içerik (content) değişirse hash de değişir", () => {
    const a = contentHash({
      source: "docs/x.md",
      title: "T",
      content: "Aynı başlık altında farklı paragraf.",
    });
    const b = contentHash({
      source: "docs/x.md",
      title: "T",
      content: "Aynı başlık altında başka paragraf.",
    });
    expect(a).not.toBe(b);
  });

  it("Türkçe karakterleri UTF-8 olarak doğru hash'ler", () => {
    const a = contentHash({
      source: "docs/workflows/aşı.md",
      title: "Aşı Kaydı",
      content: "Şüpheli hasta için çeşitli aşılar uygulanır.",
    });
    const b = contentHash({
      source: "docs/workflows/aşı.md",
      title: "Aşı Kaydı",
      content: "Şüpheli hasta için çeşitli aşılar uygulanır.",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
