/**
 * @file Guvenlik testi calistirma CLI.
 * @module @vetniva/security-test/cli-run
 *
 * @description Auth/cross-tenant baglami ile API uzerinde
 * 9 kategoride 12+ kontrolu calistirir; sonucu JSON + Markdown
 * olarak yazar. Tenant izolasyonu ve PII kurallarina uyar.
 *
 * Kullanim:
 *   pnpm --filter @vetniva/security-test run -- \
 *     --base-url=http://localhost:3001 \
 *     --token=$TOKEN --tenant=$TENANT --branch=$BRANCH \
 *     --cross-tenant=$OTHER_TENANT \
 *     --out-json=./security-report.json --out-md=./security-report.md
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SECURITY_CHECKS } from "./config.js";
import { reportToJson, reportToMarkdown } from "./report.js";
import { runSecurityChecks } from "./runner.js";

import type { SecurityAuthContext, SecurityCheck } from "./types.js";

interface Args {
  baseUrl: string;
  auth: SecurityAuthContext;
  crossAuth?: SecurityAuthContext;
  outJson: string;
  outMd: string;
  only?: string;
  includeSkipped: boolean;
}

function parseArgs(argv: ReadonlyArray<string>): Args {
  const args: Args = {
    baseUrl: "http://localhost:3001",
    auth: { token: "", tenantId: "", branchId: "" },
    outJson: "./security-report.json",
    outMd: "./security-report.md",
    includeSkipped: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    const next = (): string | undefined => {
      const v = argv[++i];
      return typeof v === "string" ? v : undefined;
    };
    if (a === "--base-url") {
      const v = next();
      if (v) args.baseUrl = v;
    } else if (a.startsWith("--base-url=")) {
      args.baseUrl = a.split("=")[1] ?? args.baseUrl;
    } else if (a === "--token") {
      const v = next();
      if (v) args.auth.token = v;
    } else if (a.startsWith("--token=")) {
      args.auth.token = a.split("=")[1] ?? "";
    } else if (a === "--tenant") {
      const v = next();
      if (v) args.auth.tenantId = v;
    } else if (a.startsWith("--tenant=")) {
      args.auth.tenantId = a.split("=")[1] ?? "";
    } else if (a === "--branch") {
      const v = next();
      if (v) args.auth.branchId = v;
    } else if (a.startsWith("--branch=")) {
      args.auth.branchId = a.split("=")[1] ?? "";
    } else if (a === "--cross-tenant") {
      const v = next();
      if (v) {
        args.crossAuth = {
          token: args.auth.token, // ayni token ile farkli tenant
          tenantId: v,
          branchId: args.auth.branchId,
        };
      }
    } else if (a.startsWith("--cross-tenant=")) {
      const v = a.split("=")[1];
      if (v) {
        args.crossAuth = {
          token: args.auth.token,
          tenantId: v,
          branchId: args.auth.branchId,
        };
      }
    } else if (a === "--out-json") {
      const v = next();
      if (v) args.outJson = v;
    } else if (a.startsWith("--out-json=")) {
      args.outJson = a.split("=")[1] ?? args.outJson;
    } else if (a === "--out-md") {
      const v = next();
      if (v) args.outMd = v;
    } else if (a.startsWith("--out-md=")) {
      args.outMd = a.split("=")[1] ?? args.outMd;
    } else if (a === "--only") {
      const v = next();
      if (v) args.only = v;
    } else if (a.startsWith("--only=")) {
      const v = a.split("=")[1];
      if (v) args.only = v;
    } else if (a === "--include-skipped") {
      args.includeSkipped = true;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.auth.token) {
    process.stderr.write(
      "HATA: --token zorunlu. Bearer token olmadan kontrollerin cogu calismaz.\n",
    );
    process.exitCode = 2;
    return;
  }
  if (!args.auth.tenantId) {
    process.stderr.write("HATA: --tenant zorunlu.\n");
    process.exitCode = 2;
    return;
  }

  let checks: ReadonlyArray<SecurityCheck> = SECURITY_CHECKS;
  if (args.only) {
    const wanted = args.only.split(",").map((s) => s.trim());
    checks = SECURITY_CHECKS.filter((c) => wanted.includes(c.key));
    if (checks.length === 0) {
      process.stderr.write(
        `HATA: --only icin eslesen kontrol yok: ${args.only}\n`,
      );
      process.exitCode = 2;
      return;
    }
  }

  const report = await runSecurityChecks({
    checks,
    baseUrl: args.baseUrl,
    auth: args.auth,
    ...(args.crossAuth ? { crossTenantAuth: args.crossAuth } : {}),
    includeSkipped: args.includeSkipped,
  });

  await writeFile(resolve(args.outJson), reportToJson(report), "utf8");
  await writeFile(resolve(args.outMd), reportToMarkdown(report), "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        outJson: args.outJson,
        outMd: args.outMd,
        allPassed: report.allPassed,
        passCount: report.passCount,
        failCount: report.failCount,
        skipCount: report.skipCount,
        bySeverity: report.bySeverity,
      },
      null,
      2,
    ) + "\n",
  );

  if (!report.allPassed) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  process.stderr.write(`run hatasi: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
