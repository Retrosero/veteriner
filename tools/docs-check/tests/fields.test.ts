/**
 * @file Field scanner testleri.
 * @module @vetniva/docs-check/tests/fields
 *
 * @description `scanFields` fonksiyonunun Zod object şemalarını
 * ve TypeScript interface alanlarını doğru biçimde çıkardığını
 * doğrular. Yanlış pozitif azaltma (TS keywords, Node builtins)
 * testleri dahildir.
 *
 * GOAL-112: Alan sözlüğü ve yetki kataloğu.
 */

import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanFields } from "../src/scanners/fields.js";

let root: string;

beforeEach(async () => {
  if (!root) {
    root = await mkdtemp(path.join(tmpdir(), "fields-scanner-"));
    await mkdir(path.join(root, "packages/contracts/src"), {
      recursive: true,
    });
    await mkdir(path.join(root, "apps/api/src/modules/owners"), {
      recursive: true,
    });
  } else {
    // Önceki test fixture dosyalarını temizle.
    const targets = [
      "packages/contracts/src/tenant.ts",
      "packages/contracts/src/branch.ts",
      "packages/contracts/src/empty.ts",
      "apps/api/src/modules/owners/owners.service.ts",
    ];
    for (const t of targets) {
      try {
        await unlink(path.join(root, t));
      } catch {
        // dosya yoksa sorun değil
      }
    }
  }
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("scanFields (GOAL-112)", () => {
  it("Zod object şeması içindeki alanları entity.field olarak çıkarır", async () => {
    await writeFile(
      path.join(root, "packages/contracts/src/tenant.ts"),
      `import { z } from "zod";

export const createTenantRequestSchema = z.object({
  slug: z.string().min(2),
  name: z.string().min(2).max(200),
  country: z.enum(["TR", "GB"]),
  taxId: z.string().optional(),
});

export const tenantResponseSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(["active", "closed"]),
});
`,
    );

    const refs = await scanFields(root);
    const ids = refs.map((r) => r.fieldId).sort();
    // Beklenen: tenant.slug, tenant.name, tenant.country, tenant.taxId,
    // tenant.id, tenant.status
    expect(ids).toContain("tenant.slug");
    expect(ids).toContain("tenant.name");
    expect(ids).toContain("tenant.country");
    expect(ids).toContain("tenant.taxId");
    expect(ids).toContain("tenant.id");
    expect(ids).toContain("tenant.status");
  });

  it("Birden fazla schema'dan aynı entity'ye ait alanları toplar (dedup)", async () => {
    await writeFile(
      path.join(root, "packages/contracts/src/branch.ts"),
      `import { z } from "zod";

export const createBranchRequestSchema = z.object({
  code: z.string(),
  name: z.string(),
  city: z.string().optional(),
});

export const updateBranchRequestSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
});
`,
    );

    const refs = await scanFields(root);
    const ids = refs.map((r) => r.fieldId).sort();
    expect(ids).toContain("branch.code");
    expect(ids).toContain("branch.name");
    expect(ids).toContain("branch.city");
    expect(ids).toContain("branch.phone");
  });

  it("TS interface alanlarını dosyadan entity çıkarımı ile toplar", async () => {
    await writeFile(
      path.join(root, "apps/api/src/modules/owners/owners.service.ts"),
      `export interface OwnerRecord {
    id: string;
    fullName: string;
    phone: string;
    email: string;
  }
`,
    );

    const refs = await scanFields(root);
    const ids = refs.map((r) => r.fieldId).sort();
    // owner (singularize edilmiş) entity'si altında beklenir.
    expect(ids).toContain("owner.id");
    expect(ids).toContain("owner.fullName");
    expect(ids).toContain("owner.phone");
    expect(ids).toContain("owner.email");
  });

  it("TS keyword'leri ve Node.js modüllerini alan adı olarak üretmez", async () => {
    await writeFile(
      path.join(root, "packages/contracts/src/tenant.ts"),
      `import { z } from "zod";
import path from "node:path";

export const testSchema = z.object({
  const: z.string().optional(), // TS keyword — elenmeli
  let: z.string().optional(),   // TS keyword — elenmeli
  slug: z.string(),             // gerçek alan — kalmalı
});
`,
    );

    const refs = await scanFields(root);
    const ids = refs.map((r) => r.fieldId);
    expect(ids).toContain("tenant.slug");
    // Zod alan adı olarak "const" ve "let" anahtar kelimeleri de
    // teknik olarak regex ile yakalanır; ancak isLikelyFieldName
    // filtresi bunları elemelidir.
    expect(ids).not.toContain("tenant.const");
    expect(ids).not.toContain("tenant.let");
  });

  it("Schema içermeyen dosyada boş liste döner", async () => {
    await writeFile(
      path.join(root, "packages/contracts/src/empty.ts"),
      `export const noSchema = "hello world";\n`,
    );

    const refs = await scanFields(root);
    expect(refs).toEqual([]);
  });

  it("Her referans için dosya yolu döner", async () => {
    await writeFile(
      path.join(root, "packages/contracts/src/branch.ts"),
      `import { z } from "zod";
export const branchSchema = z.object({
  id: z.string(),
  code: z.string(),
});
`,
    );

    const refs = await scanFields(root);
    const branchId = refs.find((r) => r.fieldId === "branch.id");
    expect(branchId).toBeDefined();
    expect(branchId?.file).toBe("packages/contracts/src/branch.ts");
  });
});
