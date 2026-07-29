/**
 * @file i18n-check unit testi.
 * @module @vetniva/i18n-check/tests
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { run } from "../src/runner.js";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "i18n-check-"));
  await mkdir(path.join(root, "packages/i18n/src/locales"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "packages/i18n/src/locales/tr-TR.json"),
    JSON.stringify({ a: { b: "1" }, c: "2" }),
  );
  await writeFile(
    path.join(root, "packages/i18n/src/locales/en-GB.json"),
    JSON.stringify({ a: { b: "1" } }),
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("i18n-check", () => {
  it("en-GB içinde eksik anahtarı warning olarak raporlar", async () => {
    const result = await run(root);
    const warnings = result.issues.filter((i) => i.severity === "warning");
    expect(warnings.some((w) => w.message.includes("c"))).toBe(true);
  });
});
