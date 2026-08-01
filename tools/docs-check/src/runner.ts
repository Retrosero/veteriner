/**
 * @file Denetleyici çalıştırıcı.
 * @module @vetniva/docs-check/runner
 * @description Repo kökünden tüm kontrolleri sırayla çalıştırır ve
 * bulguları toplar. Tek bir `run` fonksiyonu üzerinden test edilebilir.
 *
 * GOAL-004: VET- formatı hata kodu taraması.
 * GOAL-005: AI chunks tarayıcısı ve tutarlılık kontrolü.
 * GOAL-112: Alan sözlüğü tarayıcısı; yeni alan dokümansızsa hata.
 *          Permission check warning→error sertleştirildi.
 * GOAL-118: i18n key parity tarayıcısı (tr-TR/en-GB). Eksik
 *           anahtar error; fazlalık warning. Override desteği
 *           pilot kapsamı dışı route'lar içindir.
 */

import path from "node:path";

import fg from "fast-glob";

import {
  isOverridden,
  loadOverrides,
  overrideReason,
} from "./load-overrides.js";
import { scanAiChunks } from "./scanners/ai-chunks.js";
import { scanApiRoutes } from "./scanners/api.js";
import { readDocFiles } from "./scanners/docs.js";
import { scanErrorCodes } from "./scanners/error-codes.js";
import { scanFields } from "./scanners/fields.js";
import { scanI18nParity } from "./scanners/i18n.js";
import { scanPermissions } from "./scanners/permissions.js";
import { scanWebRoutes } from "./scanners/web.js";

import type { Issue, RouteInfo } from "./types.js";

export type RunResult = {
  scanned: {
    web: number;
    api: number;
    errorCodesVet: number;
    errorCodesLegacy: number;
    permissions: number;
    aiChunks: number;
    fieldRefs: number;
    fieldIds: number;
    overrides: number;
    /** Taranan i18n locale dosyası sayısı (GOAL-118). */
    i18nLocales: number;
  };
  issues: Issue[];
};

/**
 * Tüm doküman-kod uyum taramalarını çalıştırır ve bulguları birleştirir.
 * @param {string} root Proje kök dizini.
 * @returns {Promise<RunResult>} Tarama sayaçları ve uyum bulguları.
 */
export async function run(root: string): Promise<RunResult> {
  const docsRoot = path.join(root, "docs");
  const docs = await readDocFiles(docsRoot);

  // Opt-out listesi (pilot kapsamı dışı endpoint'ler).
  // Dosya yoksa veya parse hatası varsa boş set.
  const overrides = await loadOverrides(
    path.join(root, "tools/docs-check/overrides.json"),
  );

  const webRoutes: RouteInfo[] = await scanWebRoutes(
    path.join(root, "apps/web"),
  );
  const apiRoutes: RouteInfo[] = await scanApiRoutes(
    path.join(root, "apps/api"),
  );
  const errorCodes = await scanErrorCodes(root);
  const permissions: string[] = await scanPermissions(root);
  const aiChunksResult = await scanAiChunks(root);
  const fieldRefs = await scanFields(root);
  // i18n parity: packages/i18n/src/locales/*.json dosyaları arası
  // anahtar tutarlılığı (GOAL-118). Eksik anahtar error, fazlalık
  // warning. Çıktı issues listesine eklenir.
  const i18nResult = await scanI18nParity(path.join(root, "packages"));

  const issues: Issue[] = [...aiChunksResult.issues, ...i18nResult.issues];

  // 1) Web route'lar için page knowledge YAML varlık kontrolü.
  for (const route of webRoutes) {
    if (isOverridden(overrides.byRoute, "Web", route.path)) continue;
    if (!docs.pageFiles.has(route.docKey)) {
      issues.push({
        severity: "error",
        path: route.path,
        message: `Web route için sayfa bilgi kaydı eksik: docs/${route.docKey}.yaml`,
      });
    }
  }

  // 2) API route'lar için OpenAPI veya api docs varlık kontrolü.
  for (const route of apiRoutes) {
    // Override: pilot-deferred, deprecated, internal-only.
    // `route.method` tipten ötürü `string | undefined`; API scanner
    // her zaman set eder, ancak type guard için fallback kullanıyoruz.
    const method = route.method ?? "Get";
    if (isOverridden(overrides.byRoute, method, route.path)) {
      continue;
    }
    if (!docs.apiFiles.has(route.docKey)) {
      const reason = overrideReason(overrides.byRoute, method, route.path);
      issues.push({
        severity: "error",
        path: route.path,
        message: `API route için doküman eksik: docs/api/${route.docKey}.md${
          reason ? ` (override var ama match etmedi: ${reason})` : ""
        }`,
      });
    }
  }

  // 3) VET- hata kodu referansları katalogda var mı?
  for (const code of errorCodes.vetCodes) {
    if (!docs.errorCodes.has(code)) {
      issues.push({
        severity: "error",
        path: `error_code:${code}`,
        message: `Hata kodu katalogda yok: docs/errors/ERROR_CATALOG.md`,
      });
    }
  }

  // 3b) Eski TR_ kodları kullanımı uyarısı (migration).
  if (errorCodes.legacyCodes.length > 0) {
    issues.push({
      severity: "warning",
      path: "error_codes:legacy",
      message: `Eski format hata kodları kullanımda: ${errorCodes.legacyCodes.join(", ")}. 6 ay içinde VET- formatına geçirilmeli.`,
    });
  }

  // 4) Permission referansları katalogda var mı?
  // GOAL-112: Bu kontrol artık ERROR seviyesinde. Yeni permission
  // eklenirken PERMISSION_CATALOG.yaml + PERMISSION_MATRIX.md güncel
  // tutulmalıdır; aksi halde CI kırılır.
  for (const perm of permissions) {
    if (!docs.permissions.has(perm)) {
      issues.push({
        severity: "error",
        path: `permission:${perm}`,
        message: `Permission matrisi girdisi yok: docs/permissions/PERMISSION_CATALOG.yaml veya PERMISSION_MATRIX.md`,
      });
    }
  }

  // 5) Bilgi havuzunda olup kodda karşılığı olmayan sayfa kayıtları
  //    (orphan) — uyarı düzeyinde raporlanır.
  const knownRouteKeys = new Set<string>([
    ...webRoutes.map((r) => r.docKey),
    ...apiRoutes.map((r) => r.docKey),
  ]);
  for (const pageFile of docs.pageFiles) {
    if (!knownRouteKeys.has(pageFile)) {
      issues.push({
        severity: "warning",
        path: `docs/pages/${pageFile}.yaml`,
        message: "Sayfa bilgi kaydı var ancak kodda karşılığı bulunamadı.",
      });
    }
  }

  // 6) Alan referansları sözlükte var mı? (GOAL-112)
  // Kodda tanımlı alanlar fields.yaml kataloğunda karşılığı yoksa
  // CI hata verir. Yeni alan eklenirken fields.yaml + FIELD_GLOSSARY.md
  // senkron tutulmalıdır.
  for (const ref of fieldRefs) {
    if (!docs.fieldIds.has(ref.fieldId)) {
      issues.push({
        severity: "error",
        path: `field:${ref.fieldId}`,
        message: `Alan sözlüğünde kayıt yok: docs/fields/fields.yaml (referans: ${ref.file})`,
      });
    }
  }

  // 6b) Sözlükte tanımlı olup kodda hiç referansı olmayan alanlar
  //     (orphan) — uyarı düzeyinde. Bu alanlar kullanılmıyor olabilir.
  const referencedFieldIds = new Set(fieldRefs.map((r) => r.fieldId));
  for (const fieldId of docs.fieldIds) {
    if (!referencedFieldIds.has(fieldId)) {
      issues.push({
        severity: "warning",
        path: `field:${fieldId}`,
        message: `Alan sözlüğünde tanımlı ancak kodda referansı yok (orphan): docs/fields/fields.yaml`,
      });
    }
  }

  // fast-glob kullanımı referansı (lint uyarısını bastırır)
  void fg;

  return {
    scanned: {
      web: webRoutes.length,
      api: apiRoutes.length,
      errorCodesVet: errorCodes.vetCodes.length,
      errorCodesLegacy: errorCodes.legacyCodes.length,
      permissions: permissions.length,
      aiChunks: aiChunksResult.chunks,
      fieldRefs: fieldRefs.length,
      fieldIds: docs.fieldIds.size,
      overrides: overrides.byRoute.size,
      i18nLocales: i18nResult.locales.length,
    },
    issues,
  };
}
