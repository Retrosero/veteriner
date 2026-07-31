/**
 * @file i18n locale anahtar parity tarayıcısı.
 * @module @vetniva/docs-check/scanners/i18n
 *
 * @description `packages/i18n/src/locales/` altındaki tüm JSON locale
 * dosyalarını okur; iç içe (nested) anahtarları düzleştirip referans
 * locale (alfabetik ilk dosya) ile karşılaştırır. Eksik veya fazla
 * anahtarlar için issue üretir. Bu sayede `pnpm docs:check` kapısı
 * her PR'da i18n parity uyumsuzluğunu erken yakalar; üretime
 * yarım çevrilmiş UI metinleri sızmaz.
 *
 * Tasarım kararları:
 * - Referans locale alfabetik sırada ilk dosyadır (genelde
 *   `en-GB.json`). Bu, locale eklenip çıkarıldığında sıralamanın
 *   deterministik kalmasını sağlar.
 * - Eksik anahtar `error` (referansta var, karşılaştırılanda yok);
 *   fazla anahtar `warning` (referansta yok, karşılaştırılanda var —
 *   referansı güncellemek geliştiriciye bağlıdır).
 * - Düzleştirici iç içe objeleri `parent.child.grand` formatında
 *   yazar; array'ler primitive kabul edilir (i18n string'ler array
 *   olarak nadiren kullanılır, ama kullanılırsa anahtar dizi adıdır).
 * - JSON parse hatasında tüm dosya için tek `error` issue üretilir;
 *   diğer dosyalar taranmaya devam eder.
 *
 * @author GOAL-118 (FAZ-11) doküman-kod CI doğrulaması
 * @since 2026-08-01
 * @security Tarayıcı yalnızca public UI metinlerini okur; PII içermez.
 */

import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Issue } from "../types.js";

/**
 * Tarayıcı sonucu. Her locale dosyası için diğerlerine göre
 * karşılaştırma durumunu içerir.
 */
export interface I18nScanResult {
  /** Taranan locale dosya adları (sıralı). */
  locales: string[];
  /** Üretilen issue'lar. */
  issues: Issue[];
}

/**
 * Verilen kök dizinde `packages/i18n/src/locales/` altındaki tüm
 * JSON dosyalarını bulur; ilkini (alfabetik) referans alır ve
 * diğerlerini karşılaştırır.
 */
export async function scanI18nParity(
  packagesRoot: string,
): Promise<I18nScanResult> {
  const localesDir = path.join(packagesRoot, "i18n/src/locales");
  const exists = await dirExists(localesDir);
  if (!exists) {
    return { locales: [], issues: [] };
  }

  const files = await fg(["*.json"], {
    cwd: localesDir,
    onlyFiles: true,
    absolute: false,
  });
  const sorted = files.map((f) => path.basename(f)).sort();

  if (sorted.length === 0) {
    return { locales: [], issues: [] };
  }

  const referenceFile = sorted[0];
  if (!referenceFile) {
    return { locales: [], issues: [] };
  }

  const referenceAbs = path.join(localesDir, referenceFile);
  const refKeys = await loadFlattenedKeys(referenceAbs, referenceFile);
  if (refKeys === null) {
    return {
      locales: sorted,
      issues: [
        {
          severity: "error",
          path: referenceFile,
          message: `Referans locale dosyası okunamadı veya geçersiz JSON`,
        },
      ],
    };
  }

  const issues: Issue[] = [];

  for (const file of sorted.slice(1)) {
    const abs = path.join(localesDir, file);
    const otherKeys = await loadFlattenedKeys(abs, file);
    if (otherKeys === null) {
      issues.push({
        severity: "error",
        path: file,
        message: `Locale dosyası okunamadı veya geçersiz JSON`,
      });
      continue;
    }
    // Eksik: referansta var, bu dosyada yok (UI boş döner).
    const missing = [...refKeys].filter((k) => !otherKeys.has(k));
    for (const k of missing) {
      issues.push({
        severity: "error",
        path: file,
        message: `Eksik i18n anahtarı: ${k}`,
      });
    }
    // Fazla: bu dosyada var, referansta yok (kullanılmayan çeviri).
    const extra = [...otherKeys].filter((k) => !refKeys.has(k));
    for (const k of extra) {
      issues.push({
        severity: "warning",
        path: file,
        message: `Fazlalık i18n anahtarı: ${k}`,
      });
    }
  }

  return { locales: sorted, issues };
}

/**
 * JSON dosyasını okur ve anahtarları `a.b.c` formatında düzleştirir.
 * Hata durumunda null döner.
 */
async function loadFlattenedKeys(
  absPath: string,
  displayName: string,
): Promise<Set<string> | null> {
  let raw: string;
  try {
    raw = await readFile(absPath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return flattenKeys(parsed as Record<string, unknown>);
}

/**
 * İç içe objeyi `a.b.c` formatında anahtarlara düzleştirir.
 * Array'ler primitive kabul edilir; array'in kendisi anahtar olarak
 * yazılır (içindeki elemanlar düzleştirilmez — i18n string'lerde
 * array değerleri nadiren iç içe çeviri gerektirir).
 */
function flattenKeys(
  value: Record<string, unknown>,
  prefix = "",
): Set<string> {
  const result = new Set<string>();
  for (const [k, v] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const nested of flattenKeys(v as Record<string, unknown>, key)) {
        result.add(nested);
      }
    } else {
      result.add(key);
    }
  }
  return result;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const items = await fg(["."], { cwd: p, onlyFiles: false, deep: 0 });
    return items.length > 0;
  } catch {
    return false;
  }
}
