/**
 * @file Doküman envanteri okuyucusu.
 * @module @vetniva/docs-check/scanners/docs
 *
 * @description `docs/pages/`, `docs/api/`, `docs/errors/ERROR_CATALOG.md`
 * ve `docs/permissions/PERMISSION_MATRIX.md` dosyalarını okuyup envanter
 * çıkarır. Diğer tarayıcılar bu envanteri kullanır.
 */

import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DocInventory } from "../types.js";

export async function readDocFiles(docsRoot: string): Promise<DocInventory> {
  const inv: DocInventory = {
    pageFiles: new Set(),
    apiFiles: new Set(),
    errorCodes: new Set(),
    permissions: new Set(),
  };

  const pageYmls = await fg(["pages/**/*.yaml", "pages/**/*.yml"], {
    cwd: docsRoot,
    onlyFiles: true,
  });
  for (const p of pageYmls) {
    inv.pageFiles.add(p.replace(/\.(yaml|yml)$/, "").replace(/\\/g, "/"));
  }

  const apiMd = await fg(["api/**/*.md"], { cwd: docsRoot, onlyFiles: true });
  for (const p of apiMd) {
    // Path: 'api/api.get._api_v1_health.md' -> Key: 'api.get._api_v1_health'
    const stripped = p
      .replace(/^api\//, "")
      .replace(/\.md$/, "")
      .replace(/\\/g, "/");
    const normalized = stripped.replace(/\//g, ".");
    inv.apiFiles.add(normalized);
  }

  const errorCatalogPath = path.join(docsRoot, "errors/ERROR_CATALOG.md");
  const errorCatalog = await tryRead(errorCatalogPath);
  if (errorCatalog) {
    for (const m of errorCatalog.matchAll(/`([A-Z]{2}_[A-Z]+_[0-9]{4,})`/g)) {
      const code = m[1];
      if (code) inv.errorCodes.add(code);
    }
  }

  const permissionMatrixPath = path.join(
    docsRoot,
    "permissions/PERMISSION_MATRIX.md",
  );
  const permissionMatrix = await tryRead(permissionMatrixPath);
  if (permissionMatrix) {
    for (const m of permissionMatrix.matchAll(
      /`([a-z][a-z0-9_-]+:[a-z][a-z0-9_-]+(?::[a-z][a-z0-9_-]+)?)`/g,
    )) {
      const perm = m[1];
      if (perm) inv.permissions.add(perm);
    }
  }

  return inv;
}

async function tryRead(p: string): Promise<string | undefined> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return undefined;
  }
}
