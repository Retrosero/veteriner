/**
 * @file Guvenlik rapor uretici CLI.
 * @module @vetniva/security-test/cli-report
 *
 * @description Onceden calistirilmis run ciktisi (JSON) alip
 * Markdown + JSON uretir. Tenant izolasyonu ve PII
 * kurallarina uyar.
 *
 * Kullanim:
 *   pnpm --filter @vetniva/security-test report -- \
 *     --in=./security-report.json \
 *     --out-md=./security-report.md \
 *     --out-json=./security-report.json
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { reportToMarkdown, reportToJson } from "./report.js";
import type { SecurityRunReport } from "./types.js";

interface Args {
  in: string;
  outMd: string;
  outJson: string;
}

function parseArgs(argv: ReadonlyArray<string>): Args {
  const args: Args = {
    in: "./security-report.json",
    outMd: "./security-report.md",
    outJson: "./security-report.json",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    const next = (): string | undefined => {
      const v = argv[++i];
      return typeof v === "string" ? v : undefined;
    };
    if (a === "--in") {
      const v = next();
      if (v) args.in = v;
    } else if (a.startsWith("--in=")) {
      args.in = a.split("=")[1] ?? args.in;
    } else if (a === "--out-md") {
      const v = next();
      if (v) args.outMd = v;
    } else if (a.startsWith("--out-md=")) {
      args.outMd = a.split("=")[1] ?? args.outMd;
    } else if (a === "--out-json") {
      const v = next();
      if (v) args.outJson = v;
    } else if (a.startsWith("--out-json=")) {
      args.outJson = a.split("=")[1] ?? args.outJson;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(resolve(args.in), "utf8");
  const report = JSON.parse(raw) as SecurityRunReport;

  await writeFile(resolve(args.outMd), reportToMarkdown(report), "utf8");
  await writeFile(resolve(args.outJson), reportToJson(report), "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        outMd: args.outMd,
        outJson: args.outJson,
        allPassed: report.allPassed,
        passCount: report.passCount,
        failCount: report.failCount,
        skipCount: report.skipCount,
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((err) => {
  process.stderr.write(`report hatasi: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
