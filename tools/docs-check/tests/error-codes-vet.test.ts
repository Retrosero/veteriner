/**
 * @file Error codes scanner (VET- format) testleri.
 * @module @vetniva/docs-check/tests/error-codes-vet
 *
 * @description `scanErrorCodes` fonksiyonunun VET- ve legacy
 * format ayrımını test eder.
 */

import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanErrorCodes } from "../src/scanners/error-codes.js";

let root: string;

beforeEach(async () => {
  if (!root) {
    root = await mkdtemp(path.join(tmpdir(), "error-codes-"));
    await mkdir(path.join(root, "apps/api/src/common"), { recursive: true });
  } else {
    // Önceki test dosyalarını temizle (fixture izolasyonu).
    for (const f of ["example.ts", "example2.ts", "empty.ts"]) {
      try {
        await unlink(path.join(root, `apps/api/src/common/${f}`));
      } catch {
        // dosya yoksa sorun değil
      }
    }
  }
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("scanErrorCodes (VET- format)", () => {
  it("VET- kodlarını yakalar, legacy'yi ayrı tutar", async () => {
    await writeFile(
      path.join(root, "apps/api/src/common/example.ts"),
      `throw new DomainError({ errorCode: "VET-CLINIC-0001" });
       throw new DomainError({ errorCode: "VET-AUTH-0001" });
       // Eski format (migration):
       throw new DomainError({ errorCode: "TR_COMMON_0001" });`,
    );
    const r = await scanErrorCodes(root);
    expect(r.vetCodes).toContain("VET-CLINIC-0001");
    expect(r.vetCodes).toContain("VET-AUTH-0001");
    expect(r.legacyCodes).toContain("TR_COMMON_0001");
    expect(r.legacyCodes).not.toContain("VET-CLINIC-0001");
  });

  it("EN_ legacy kodlarını da yakalar", async () => {
    await writeFile(
      path.join(root, "apps/api/src/common/example.ts"),
      `throw new DomainError({ errorCode: "EN_CLINIC_0001" });`,
    );
    const r = await scanErrorCodes(root);
    expect(r.legacyCodes).toContain("EN_CLINIC_0001");
  });

  it("kod yoksa boş döner", async () => {
    await writeFile(
      path.join(root, "apps/api/src/common/example.ts"),
      `export const foo = 1;`,
    );
    const r = await scanErrorCodes(root);
    expect(r.vetCodes).toEqual([]);
    expect(r.legacyCodes).toEqual([]);
  });
});
