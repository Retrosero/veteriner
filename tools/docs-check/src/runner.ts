/**
 * @file Denetleyici çalıştırıcı.
 * @module @vetniva/docs-check/runner
 *
 * @description Repo kökünden tüm kontrolleri sırayla çalıştırır ve
 * bulguları toplar. Tek bir `run` fonksiyonu üzerinden test edilebilir.
 *
 * GOAL-004: VET- formatı hata kodu taraması.
 * GOAL-005: AI chunks tarayıcısı ve tutarlılık kontrolü.
 */

import fg from "fast-glob";
import path from "node:path";

import { scanWebRoutes } from "./scanners/web.js";
import { scanApiRoutes } from "./scanners/api.js";
import { scanErrorCodes } from "./scanners/error-codes.js";
import { scanPermissions } from "./scanners/permissions.js";
import { scanAiChunks } from "./scanners/ai-chunks.js";
import { readDocFiles } from "./scanners/docs.js";
import type { Issue, RouteInfo } from "./types.js";

export type RunResult = {
  scanned: {
    web: number;
    api: number;
    errorCodesVet: number;
    errorCodesLegacy: number;
    permissions: number;
    aiChunks: number;
  };
  issues: Issue[];
};

export async function run(root: string): Promise<RunResult> {
  const docsRoot = path.join(root, "docs");
  const docs = await readDocFiles(docsRoot);

  const webRoutes: RouteInfo[] = await scanWebRoutes(
    path.join(root, "apps/web"),
  );
  const apiRoutes: RouteInfo[] = await scanApiRoutes(
    path.join(root, "apps/api"),
  );
  const errorCodes = await scanErrorCodes(root);
  const permissions: string[] = await scanPermissions(root);
  const aiChunksResult = await scanAiChunks(root);

  const issues: Issue[] = [...aiChunksResult.issues];

  // 1) Web route'lar için page knowledge YAML varlık kontrolü.
  for (const route of webRoutes) {
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
    if (!docs.apiFiles.has(route.docKey)) {
      issues.push({
        severity: "error",
        path: route.path,
        message: `API route için doküman eksik: docs/api/${route.docKey}.md`,
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

  // 4) Permission referansları matriste var mı?
  for (const perm of permissions) {
    if (!docs.permissions.has(perm)) {
      issues.push({
        severity: "warning",
        path: `permission:${perm}`,
        message: `Permission matrisi girdisi yok: docs/permissions/PERMISSION_MATRIX.md`,
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
    },
    issues,
  };
}
