/**
 * @file Override listesi yükleyici.
 * @module @vetniva/docs-check/load-overrides
 * @description Docs-check opt-out listesi yükler ve
 * verilen bir route (METHOD + path) için opt-out
 * uygulanıp uygulanmadığını söyler.
 * @since GOAL-118 (FAZ-11) pilot temizliği
 */

import { readFile } from "node:fs/promises";

import { load as parseYaml } from "js-yaml";

/** Override kuralı. */
export interface OverrideRule {
  reason: string;
  match: string[];
}

/** Override dosyası yapısı. */
export interface OverridesFile {
  version: string;
  rules: OverrideRule[];
}

/** Yüklenmiş override set (METHOD + path → reason). */
export type OverrideSet = Map<string, string>;

/** Yüklenmiş override set + ham kurallar. */
export interface LoadedOverrides {
  byRoute: OverrideSet;
  rules: OverrideRule[];
}

/**
 * Yoldan override dosyasını yükler. Dosya yoksa boş set.
 * @param filePath
 */
export async function loadOverrides(
  filePath: string,
): Promise<LoadedOverrides> {
  let parsed: OverridesFile | null = null;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Yol yalnızca runner'ın repo kökünden üretilir.
    const raw = await readFile(filePath, "utf8");
    parsed = parseYaml(raw) as OverridesFile | null;
  } catch {
    return { byRoute: new Map(), rules: [] };
  }
  if (!parsed || !Array.isArray(parsed.rules)) {
    return { byRoute: new Map(), rules: [] };
  }
  const byRoute = new Map<string, string>();
  for (const rule of parsed.rules) {
    if (!Array.isArray(rule.match)) continue;
    for (const pattern of rule.match) {
      // "METHOD /api/v1/foo" formatı.
      const m = pattern.match(/^([A-Z]+)\s+(.+)$/);
      if (!m) continue;
      byRoute.set(`${m[1]} ${m[2]}`, rule.reason);
    }
  }
  return { byRoute, rules: parsed.rules };
}

/**
 * Verilen route override set'te var mı?
 * @param set
 * @param method
 * @param path
 */
export function isOverridden(
  set: OverrideSet,
  method: string,
  path: string,
): boolean {
  return set.has(`${method} ${path}`);
}

/**
 * Override reason.
 * @param set
 * @param method
 * @param path
 */
export function overrideReason(
  set: OverrideSet,
  method: string,
  path: string,
): string | undefined {
  return set.get(`${method} ${path}`);
}
