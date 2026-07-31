/**
 * @file Permission scanner testleri.
 * @module @vetniva/docs-check/tests/permissions
 *
 * @description `scanPermissions` fonksiyonunun koddaki permission
 * referanslarını çıkarma, Node.js builtin'leri ve Tailwind utility
 * class'larını eleme, hem backend hem frontend dosyalarını tarama
 * davranışlarını doğrular.
 */

import { describe, expect, it, beforeEach, afterAll } from "vitest";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanPermissions } from "../src/scanners/permissions.js";

let root: string;

beforeEach(async () => {
  if (!root) {
    root = await mkdtemp(path.join(tmpdir(), "permissions-scanner-"));
    await mkdir(path.join(root, "apps/api/src/modules/clinic"), {
      recursive: true,
    });
    await mkdir(path.join(root, "apps/web/src/app/owners"), {
      recursive: true,
    });
  } else {
    for (const f of [
      "apps/api/src/modules/clinic/clinic.controller.ts",
      "apps/api/src/modules/clinic/orders.controller.ts",
      "apps/web/src/app/owners/page.tsx",
    ]) {
      try {
        await unlink(path.join(root, f));
      } catch {
        // dosya yoksa sorun değil
      }
    }
  }
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("scanPermissions", () => {
  it("tek segment (domain:action) permission string'lerini yakalar", async () => {
    await writeFile(
      path.join(root, "apps/api/src/modules/clinic/clinic.controller.ts"),
      `const PERM = "clinic:patient:read";
@Require('clinic:patient:read') list() {}`,
    );
    const perms = await scanPermissions(root);
    expect(perms).toContain("clinic:patient:read");
  });

  it("üç segment (domain:resource:action) permission string'lerini yakalar", async () => {
    await writeFile(
      path.join(root, "apps/api/src/modules/clinic/clinic.controller.ts"),
      `const PERM = "petshop:sale:create";
const PERM2 = 'petshop:sale:cancel';`,
    );
    const perms = await scanPermissions(root);
    expect(perms).toContain("petshop:sale:create");
    expect(perms).toContain("petshop:sale:cancel");
  });

  it("birden fazla dosyadan tekil küme (Set) üretir — dedup", async () => {
    await writeFile(
      path.join(root, "apps/api/src/modules/clinic/clinic.controller.ts"),
      `const A = "clinic:patient:read";`,
    );
    await writeFile(
      path.join(root, "apps/api/src/modules/clinic/orders.controller.ts"),
      `const B = "clinic:patient:read"; // aynı
       const C = "clinic:order:create";`,
    );
    const perms = await scanPermissions(root);
    const readCount = perms.filter((p) => p === "clinic:patient:read").length;
    expect(readCount).toBe(1);
    expect(perms).toContain("clinic:order:create");
  });

  it("Node.js builtin modülleri elenir (yanlış pozitif azaltma)", async () => {
    await writeFile(
      path.join(root, "apps/api/src/modules/clinic/clinic.controller.ts"),
      `import path from "node:path";
import crypto from "node:crypto";
import { readFile } from "node:fs";
const A = "fs";
const B = "node:path";
const C = "http";
// Gerçek permission
const PERM = "clinic:patient:read";`,
    );
    const perms = await scanPermissions(root);
    expect(perms).not.toContain("fs");
    expect(perms).not.toContain("node:path");
    expect(perms).not.toContain("http");
    expect(perms).toContain("clinic:patient:read");
  });

  it("Tailwind utility class'ları elenir (sm:md:lg breakpoint kalıbı)", async () => {
    await writeFile(
      path.join(root, "apps/web/src/app/owners/page.tsx"),
      `// Tailwind responsive utilities — bunlar permission DEĞİL.
className="sm:text-sm md:p-2 lg:flex xl:grid 2xl:block"
// Gerçek permission string
const PERM = "clinic:patient:read";`,
    );
    const perms = await scanPermissions(root);
    expect(perms).not.toContain("sm:text-sm");
    expect(perms).not.toContain("md:p-2");
    expect(perms).not.toContain("lg:flex");
    expect(perms).not.toContain("xl:grid");
    expect(perms).not.toContain("2xl:block");
    expect(perms).toContain("clinic:patient:read");
  });

  it("frontend (apps/web) dosyalarını da tarar", async () => {
    await writeFile(
      path.join(root, "apps/web/src/app/owners/page.tsx"),
      `const PERM = "clinic:patient:write";`,
    );
    const perms = await scanPermissions(root);
    expect(perms).toContain("clinic:patient:write");
  });

  it("string literal içermeyen dosyalar boş katkı sağlar", async () => {
    await writeFile(
      path.join(root, "apps/api/src/modules/clinic/clinic.controller.ts"),
      `// hiç permission yok
export const foo = 42;`,
    );
    const perms = await scanPermissions(root);
    expect(perms).toEqual([]);
  });

  it("permission olmayan dosyalar mevcut olduğunda bile bulunabilir", async () => {
    // İki dosyadan sadece biri permission içerir.
    await writeFile(
      path.join(root, "apps/api/src/modules/clinic/clinic.controller.ts"),
      `// no perm here
const x = 1;`,
    );
    await writeFile(
      path.join(root, "apps/api/src/modules/clinic/orders.controller.ts"),
      `const PERM = "lab:order:submit";`,
    );
    const perms = await scanPermissions(root);
    expect(perms).toContain("lab:order:submit");
  });
});
