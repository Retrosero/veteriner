/**
 * @file i18n key parity scanner testleri.
 * @module @vetniva/docs-check/tests/i18n
 *
 * @description `scanI18nParity` fonksiyonunun geçici bir fixture
 * locale diziniyle doğrulamasını yapar. Test edilen başlıklar:
 *
 * 1. Düz (flat) anahtarlar — `error` ve `warning` ayrımı.
 * 2. İç içe (nested) anahtarlar — `parent.child` düzleştirme.
 * 3. Locale dizini yoksa boş sonuç.
 * 4. Locale dizini boşsa boş sonuç.
 * 5. Geçersiz JSON — ilgili dosya için error.
 * 6. Tek locale (kendiyle karşılaştırma) — boş sonuç.
 * 7. Üç+ locale — referans dışındaki her dosya karşılaştırılır.
 * 8. Array değerleri — primitive kabul, anahtar adı olarak yazılır.
 *
 * @author GOAL-118 (FAZ-11) doküman-kod CI doğrulaması
 * @since 2026-08-01
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanI18nParity } from "../src/scanners/i18n.js";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "i18n-scanner-"));
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function writeLocale(
  locale: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(root, "i18n/src/locales");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, locale), JSON.stringify(data, null, 2));
}

describe("scanI18nParity", () => {
  it("locale dizini yoksa boş sonuç döner", async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), "i18n-empty-"));
    try {
      const result = await scanI18nParity(emptyRoot);
      expect(result.locales).toEqual([]);
      expect(result.issues).toEqual([]);
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it("locale dizini boşsa boş sonuç döner", async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "i18n-blank-"));
    await mkdir(path.join(tmpRoot, "i18n/src/locales"), { recursive: true });
    try {
      const result = await scanI18nParity(tmpRoot);
      expect(result.locales).toEqual([]);
      expect(result.issues).toEqual([]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("düz anahtarlar — referans ve karşı eşitse issues boş", async () => {
    await writeLocale("en-GB.json", { hello: "Hello", bye: "Bye" });
    await writeLocale("tr-TR.json", { hello: "Merhaba", bye: "Hoşçakal" });
    const result = await scanI18nParity(root);
    expect(result.locales).toEqual(["en-GB.json", "tr-TR.json"]);
    expect(result.issues).toEqual([]);
  });

  it("düz anahtarlar — karşıda eksik olan error üretir", async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "i18n-missing-"));
    await mkdir(path.join(tmpRoot, "i18n/src/locales"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/en-GB.json"),
      JSON.stringify({ a: "A", b: "B", c: "C" }),
    );
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/tr-TR.json"),
      JSON.stringify({ a: "A" }),
    );
    try {
      const result = await scanI18nParity(tmpRoot);
      const missing = result.issues.filter(
        (i) => i.severity === "error" && i.path === "tr-TR.json",
      );
      const keys = missing.map((i) => i.message).sort();
      expect(keys).toEqual([
        "Eksik i18n anahtarı: b",
        "Eksik i18n anahtarı: c",
      ]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("düz anahtarlar — karşıda fazla olan warning üretir", async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "i18n-extra-"));
    await mkdir(path.join(tmpRoot, "i18n/src/locales"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/en-GB.json"),
      JSON.stringify({ a: "A" }),
    );
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/tr-TR.json"),
      JSON.stringify({ a: "A", x: "X", y: "Y" }),
    );
    try {
      const result = await scanI18nParity(tmpRoot);
      const extra = result.issues.filter(
        (i) => i.severity === "warning" && i.path === "tr-TR.json",
      );
      const keys = extra.map((i) => i.message).sort();
      expect(keys).toEqual([
        "Fazlalık i18n anahtarı: x",
        "Fazlalık i18n anahtarı: y",
      ]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("iç içe anahtarlar `a.b.c` formatında düzleştirilir", async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "i18n-nested-"));
    await mkdir(path.join(tmpRoot, "i18n/src/locales"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/en-GB.json"),
      JSON.stringify({
        nav: { dashboard: "Dashboard", settings: { profile: "Profile" } },
      }),
    );
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/tr-TR.json"),
      JSON.stringify({
        nav: { dashboard: "Panel" },
      }),
    );
    try {
      const result = await scanI18nParity(tmpRoot);
      const missing = result.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.message)
        .sort();
      expect(missing).toEqual([
        "Eksik i18n anahtarı: nav.settings.profile",
      ]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("geçersiz JSON için dosya bazında error üretir", async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "i18n-bad-"));
    await mkdir(path.join(tmpRoot, "i18n/src/locales"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/en-GB.json"),
      JSON.stringify({ a: "A" }),
    );
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/tr-TR.json"),
      "{ this is not valid json",
    );
    try {
      const result = await scanI18nParity(tmpRoot);
      const jsonErrors = result.issues.filter(
        (i) =>
          i.severity === "error" &&
          i.path === "tr-TR.json" &&
          i.message.includes("okunamadı"),
      );
      expect(jsonErrors.length).toBe(1);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("tek locale (kendiyle karşılaştırma) — boş issues", async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "i18n-single-"));
    await mkdir(path.join(tmpRoot, "i18n/src/locales"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/en-GB.json"),
      JSON.stringify({ a: "A", b: { c: "C" } }),
    );
    try {
      const result = await scanI18nParity(tmpRoot);
      expect(result.locales).toEqual(["en-GB.json"]);
      expect(result.issues).toEqual([]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("üç locale — referans dışındaki her dosya karşılaştırılır", async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "i18n-three-"));
    await mkdir(path.join(tmpRoot, "i18n/src/locales"), { recursive: true });
    // Alfabetik sırada referans: de-DE.json
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/de-DE.json"),
      JSON.stringify({ greet: "Hallo", farewell: "Tschüss" }),
    );
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/en-GB.json"),
      JSON.stringify({ greet: "Hello" }),
    );
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/tr-TR.json"),
      JSON.stringify({ greet: "Merhaba", farewell: "Hoşçakal", extra: "X" }),
    );
    try {
      const result = await scanI18nParity(tmpRoot);
      expect(result.locales).toEqual([
        "de-DE.json",
        "en-GB.json",
        "tr-TR.json",
      ]);
      const enIssues = result.issues.filter((i) => i.path === "en-GB.json");
      expect(enIssues.length).toBe(1);
      expect(enIssues[0]?.severity).toBe("error");
      expect(enIssues[0]?.message).toBe("Eksik i18n anahtarı: farewell");

      const trMissing = result.issues.filter(
        (i) => i.path === "tr-TR.json" && i.severity === "error",
      );
      expect(trMissing).toEqual([]);

      const trExtra = result.issues.filter(
        (i) => i.path === "tr-TR.json" && i.severity === "warning",
      );
      expect(trExtra.length).toBe(1);
      expect(trExtra[0]?.message).toBe("Fazlalık i18n anahtarı: extra");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("array değerleri primitive kabul edilir (anahtar adı olarak yazılır)", async () => {
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "i18n-array-"));
    await mkdir(path.join(tmpRoot, "i18n/src/locales"), { recursive: true });
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/en-GB.json"),
      JSON.stringify({ items: ["a", "b"] }),
    );
    await writeFile(
      path.join(tmpRoot, "i18n/src/locales/tr-TR.json"),
      JSON.stringify({ items: ["x", "y", "z"] }),
    );
    try {
      const result = await scanI18nParity(tmpRoot);
      // items anahtarı her iki dosyada da var; array içeriği
      // düzleştirilmez, sadece anahtar adı kontrol edilir.
      expect(result.issues).toEqual([]);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
