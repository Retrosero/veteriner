/**
 * @file Hata kodu tarayıcısı.
 * @module @vetniva/docs-check/scanners/error-codes
 * @description Backend kodunda geçen ve `errorCodeSchema` ile uyumlu
 * hata kodlarını bulur. Format: `VET-<MODULE>-<NNN>` (GOAL-004).
 * Eski `TR_<DOMAIN>_<NNN>` formatı 6 ay alias olarak desteklenir.
 * Yalnızca statik analiz yapılır; dinamik kodlar kapsam dışıdır.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

/**
 * Yeni VET- formatı: `VET-<MODULE>-<NNN>`.
 */
const VET_CODE_RE = /['"`](VET-[A-Z]{2,12}-[0-9]{4})['"`]/g;

/**
 * Eski format (6 ay alias): `TR_<DOMAIN>_<NNN>` veya
 * `EN_<DOMAIN>_<NNN>`. Yeni kodlar için kullanılmaz; geriye
 * uyumluluk için taranır.
 */
// eslint-disable-next-line security/detect-unsafe-regex -- Sabit desen yalnızca kaynak envanteri için uygulanır.
const LEGACY_CODE_RE = /['"`]((TR|EN)_[A-Z]+(_[A-Z]+)*_[0-9]{1,4})['"`]/g;

export interface ErrorCodeScanResult {
  vetCodes: string[];
  legacyCodes: string[];
}

/**
 * Kod tabanındaki VET ve legacy hata kodu referanslarını toplar.
 * @param root
 */
export async function scanErrorCodes(
  root: string,
): Promise<ErrorCodeScanResult> {
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

  const vetSeen = new Set<string>();
  const legacySeen = new Set<string>();

  for (const rel of files) {
    const abs = path.join(root, rel);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Yol repo kökü ve glob sonucu ile sınırlıdır.
    const text = await readFile(abs, "utf8");

    for (const m of text.matchAll(VET_CODE_RE)) {
      const code = m[1];
      if (code) vetSeen.add(code);
    }

    for (const m of text.matchAll(LEGACY_CODE_RE)) {
      const code = m[1];
      if (code) legacySeen.add(code);
    }
  }

  return {
    vetCodes: [...vetSeen].sort(),
    legacyCodes: [...legacySeen].sort(),
  };
}
