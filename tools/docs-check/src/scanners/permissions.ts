/**
 * @file Permission referansı tarayıcısı.
 * @module @vetniva/docs-check/scanners/permissions
 * @description Kodda geçen permission string'lerini bulur. Format
 * önerisi: `<domain>:<action>` (ör. `clinic:patient:read`,
 * `petshop:sale:create`). Yanlış pozitifleri azaltmak için
 * Node.js builtin modülleri ve Tailwind utility class'ları
 * elenir.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

const PERMISSION_RE =
  /['"`]([a-z][a-z0-9_-]+:[a-z][a-z0-9_-]+(?::[a-z][a-z0-9_-]+)?)['"`]/gi; // eslint-disable-line security/detect-unsafe-regex -- Sabit desen yalnızca kaynak envanteri için uygulanır.

const NODE_BUILTINS = new Set([
  "node:fs",
  "node:path",
  "node:crypto",
  "node:util",
  "node:os",
  "node:http",
  "node:https",
  "node:url",
  "node:stream",
  "node:buffer",
  "node:events",
  "node:child_process",
  "node:cluster",
  "node:dns",
  "node:net",
  "node:tls",
  "node:zlib",
  "node:assert",
  "node:async_hooks",
  "fs",
  "path",
  "crypto",
  "util",
  "os",
  "http",
  "https",
  "url",
  "stream",
  "buffer",
  "events",
  "child_process",
  "cluster",
  "dns",
  "net",
  "tls",
  "zlib",
  "assert",
  "async_hooks",
]);

/**
 * Tailwind utility sınıfı önekleri (state + breakpoint). Bu öneklerle
 * başlayan string'ler `colon` ayraçlı Tailwind class'ıdır; permission
 * matrisi girdisi olarak değerlendirilmez. Yeni önek eklenirse
 * buraya eklenmesi gerekir.
 */
const TAILWIND_PREFIXES = new Set([
  // Breakpoints
  "sm", "md", "lg", "xl", "2xl",
  // State önekleri
  "hover", "focus", "active", "disabled", "visited", "checked",
  "first", "last", "odd", "even", "empty", "required", "optional",
  "group-hover", "group-focus", "peer-hover", "peer-focus",
  "before", "after", "placeholder", "file", "marker", "selection",
  "rtl", "ltr",
  "print", "dark", "motion-safe", "motion-reduce",
]);

/**
 * Bilinen false positive kalıpları. Bunlar CSS özellik adları
 * (`display:none`, `overflow:hidden`, vb.) veya üç parçalı izin
 * formunun yanlışlıkla eşleştiği string'lerdir. Tarayıcı,
 * permission matrisi girdisi olarak değerlendirilmez.
 */
const CSS_PROPERTY_VALUES = new Set([
  "display:none",
  "overflow:hidden",
  "overflow:auto",
  "overflow:scroll",
  "text-align:left",
  "text-align:right",
  "text-align:center",
  "text-align:justify",
  "align-items:flex-start",
  "align-items:flex-end",
  "align-items:center",
  "justify-content:flex-start",
  "justify-content:flex-end",
  "justify-content:center",
  "justify-content:space-between",
  "flex-direction:row",
  "flex-direction:column",
  "position:relative",
  "position:absolute",
  "position:fixed",
  "position:sticky",
  "cursor:pointer",
  "cursor:not-allowed",
  "visibility:hidden",
  "visibility:visible",
  "white-space:nowrap",
  "word-break:break-all",
]);

/**
 * Bir değerin Node.js yerleşik modül adı olup olmadığını belirler.
 * @param perm
 */
function isNodeBuiltin(perm: string): boolean {
  return NODE_BUILTINS.has(perm);
}

/**
 * Bir colon içeren değerin Tailwind utility sınıfı olup olmadığını belirler.
 * Önek listesi (TAILWIND_PREFIXES) state + breakpoint öneklerini kapsar.
 * @param perm
 */
function looksLikeTailwindClass(perm: string): boolean {
  const parts = perm.split(":");
  if (parts.length < 2) return false;
  return TAILWIND_PREFIXES.has(parts[0] ?? "");
}

/**
 * API ve web kaynaklarından permission referanslarını toplar.
 * @param root
 */
export async function scanPermissions(root: string): Promise<string[]> {
  const files = await fg(
    ["apps/api/src/**/*.ts", "apps/web/src/**/*.{ts,tsx}"],
    {
      cwd: root,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/dist/**"],
    },
  );

  const seen = new Set<string>();
  for (const rel of files) {
    const abs = path.join(root, rel);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Yol repo kökü ve glob sonucu ile sınırlıdır.
    const text = await readFile(abs, "utf8");
    for (const m of text.matchAll(PERMISSION_RE)) {
      const perm = m[1];
      if (!perm) continue;
      if (isNodeBuiltin(perm)) continue;
      if (looksLikeTailwindClass(perm)) continue;
      if (CSS_PROPERTY_VALUES.has(perm)) continue;
      seen.add(perm);
    }
  }
  return [...seen];
}
