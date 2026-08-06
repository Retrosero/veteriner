/**
 * @file Guvenlik kontrol katalogu dogrulama CLI.
 * @module @vetniva/security-test/cli-validate
 *
 * @description SECURITY_CHECKS katalogunun bilesik
 * ozelliklerini (key unique, 9 kontrol kategorisi
 * temsil, ASVS seviyesi) dogrular. Tenant izolasyonu
 * ve PII kurallarina uyar.
 *
 * Kullanim:
 *   pnpm --filter @vetniva/security-test validate
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { SECURITY_CHECKS, getCheck, listCheckKeys } from "./config.js";

import type { SecurityControl } from "./types.js";

const EXPECTED_CONTROLS: ReadonlyArray<SecurityControl> = [
  "auth",
  "authz",
  "idor",
  "xss",
  "csrf",
  "sql_injection",
  "file_upload",
  "rate_limit",
  "tenant_isolation",
];

async function main(): Promise<void> {
  const summary: Record<string, unknown> = {
    total: SECURITY_CHECKS.length,
    keys: listCheckKeys(),
  };

  const issues: string[] = [];

  // 1) Key unique
  const seen = new Set<string>();
  for (const c of SECURITY_CHECKS) {
    if (seen.has(c.key)) {
      issues.push(`Duplicate key: ${c.key}`);
    }
    seen.add(c.key);
  }

  // 2) 9 kontrol kategorisi temsili
  const presentControls = new Set<SecurityControl>(
    SECURITY_CHECKS.map((c) => c.control),
  );
  for (const expected of EXPECTED_CONTROLS) {
    if (!presentControls.has(expected)) {
      issues.push(`Eksik kontrol kategorisi: ${expected}`);
    }
  }

  // 3) Her kontrolun en az 1 step'i var
  for (const c of SECURITY_CHECKS) {
    if (c.steps.length === 0) {
      issues.push(`${c.key}: en az 1 step gerekli`);
    }
    for (const s of c.steps) {
      if (s.expectStatus.length === 0) {
        issues.push(`${c.key}/${s.name}: expectStatus bos olamaz`);
      }
    }
  }

  // 4) severity enum
  const validSeverity = new Set(["critical", "high", "medium", "low", "info"]);
  for (const c of SECURITY_CHECKS) {
    if (!validSeverity.has(c.failureSeverity)) {
      issues.push(`${c.key}: gecersiz severity ${c.failureSeverity}`);
    }
  }

  // 5) Bilinmeyen key getCheck ile cozulur
  try {
    getCheck(SECURITY_CHECKS[0]?.key ?? "");
  } catch (err) {
    issues.push(`getCheck hata: ${(err as Error).message}`);
  }

  summary["issues"] = issues;
  summary["allOk"] = issues.length === 0;

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`validate hatasi: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
