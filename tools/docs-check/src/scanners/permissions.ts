/**
 * @file Permission referansı tarayıcısı.
 * @module @vetniva/docs-check/scanners/permissions
 *
 * @description Kodda geçen permission string'lerini bulur. Format
 * önerisi: `<domain>:<action>` (ör. `clinic:patient:read`,
 * `petshop:sale:create`). Yanlış pozitifleri azaltmak için
 * Node.js builtin modülleri ve Tailwind utility class'ları
 * elenir.
 */

import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PERMISSION_RE =
  /['"`]([a-z][a-z0-9_-]+:[a-z][a-z0-9_-]+(?::[a-z][a-z0-9_-]+)?)['"`]/gi;

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

const TAILWIND_BREAKPOINTS = new Set(["sm", "md", "lg", "xl", "2xl"]);

function isNodeBuiltin(perm: string): boolean {
  return NODE_BUILTINS.has(perm);
}

function looksLikeTailwindClass(perm: string): boolean {
  const parts = perm.split(":");
  if (parts.length < 2) return false;
  return TAILWIND_BREAKPOINTS.has(parts[0] ?? "");
}

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
    const text = await readFile(abs, "utf8");
    for (const m of text.matchAll(PERMISSION_RE)) {
      const perm = m[1];
      if (!perm) continue;
      if (isNodeBuiltin(perm)) continue;
      if (looksLikeTailwindClass(perm)) continue;
      seen.add(perm);
    }
  }
  return [...seen];
}
