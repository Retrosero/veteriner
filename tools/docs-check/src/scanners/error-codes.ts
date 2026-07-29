/**
 * @file Hata kodu tarayıcısı.
 * @module @vetniva/docs-check/scanners/error-codes
 *
 * @description Backend kodunda geçen ve `errorCodeSchema` ile uyumlu
 * hata kodlarını bulur. Format: `[A-Z]{2}_[A-Z]+_[0-9]{4,}`.
 * Yalnızca statik analiz yapılır; dinamik kodlar kapsam dışıdır.
 */

import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ERROR_CODE_RE = /['"`]([A-Z]{2}_[A-Z]+_[0-9]{4,})['"`]/g;

export async function scanErrorCodes(root: string): Promise<string[]> {
  const files = await fg(
    [
      "apps/api/src/**/*.ts",
      "apps/web/src/**/*.{ts,tsx}",
      "packages/contracts/src/**/*.ts",
    ],
    {
      cwd: root,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/dist/**"],
    },
  );

  const seen = new Set<string>();
  for (const rel of files) {
    const abs = path.join(root, rel);
    const text = await readFile(abs, "utf8");
    for (const m of text.matchAll(ERROR_CODE_RE)) {
      const code = m[1];
      if (code) seen.add(code);
    }
  }
  return [...seen];
}
