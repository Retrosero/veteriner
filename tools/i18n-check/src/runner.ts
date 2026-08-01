/**
 * @file I18n parity çalıştırıcı.
 * @module @vetniva/i18n-check/runner
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export type Issue = {
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type RunResult = {
  issues: Issue[];
};

/**
 * Packages/i18n/src/locales/ altındaki tüm JSON dosyalarını tarar; ilk
 * dosyayı (alfabetik sırada en önde gelen) referans kabul edip diğer
 * dosyalarla karşılaştırır. İlk dosya genellikle tr-TR.json'dur.
 * @param {string} root Proje kök dizini.
 * @returns {Promise<RunResult>} Locale farklarını içeren denetim sonucu.
 */
export async function run(root: string): Promise<RunResult> {
  const localesDir = path.join(root, "packages/i18n/src/locales");
  const files = ["tr-TR.json", "en-GB.json"].map((f) =>
    path.join(localesDir, f),
  );

  const referenceFile = files[0];
  if (!referenceFile) {
    return {
      issues: [
        {
          severity: "error",
          path: referenceFile ?? "?",
          message: "Referans locale dosyası yok",
        },
      ],
    };
  }

  let reference: Record<string, unknown>;
  try {
    // `referenceFile`, sabit locale listesinden ve proje kökünden türetilir.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    reference = JSON.parse(await readFile(referenceFile, "utf8")) as Record<
      string,
      unknown
    >;
  } catch (err) {
    return {
      issues: [
        {
          severity: "error",
          path: referenceFile,
          message: `Referans dosya okunamadı: ${(err as Error).message}`,
        },
      ],
    };
  }

  const refKeys = flattenKeys(reference);
  const issues: Issue[] = [];

  for (const file of files.slice(1)) {
    let other: Record<string, unknown>;
    try {
      // `file`, sabit locale listesinden ve proje kökünden türetilir.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      other = JSON.parse(await readFile(file, "utf8")) as Record<
        string,
        unknown
      >;
    } catch (err) {
      issues.push({
        severity: "error",
        path: file,
        message: `Locale dosyası okunamadı: ${(err as Error).message}`,
      });
      continue;
    }
    const otherKeys = flattenKeys(other);
    const missing = [...refKeys].filter((k) => !otherKeys.has(k));
    const extra = [...otherKeys].filter((k) => !refKeys.has(k));
    for (const k of missing) {
      issues.push({
        severity: "warning",
        path: file,
        message: `Eksik anahtar: ${k}`,
      });
    }
    for (const k of extra) {
      issues.push({
        severity: "warning",
        path: file,
        message: `Fazlalık anahtar: ${k}`,
      });
    }
  }

  return { issues };
}

/**
 * İç içe locale nesnesindeki yaprak anahtarları noktalı yola dönüştürür.
 * @param {Record<string, unknown>} value Düzleştirilecek locale nesnesi.
 * @param {string} prefix Üst anahtar yolu.
 * @returns {Set<string>} Noktalı yaprak anahtarları.
 */
function flattenKeys(value: Record<string, unknown>, prefix = ""): Set<string> {
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
