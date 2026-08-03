/**
 * @file k6 ozetinden rapor ureten CLI.
 * @module @vetniva/load-test/cli-report
 *
 * @description k6 --summary-export ile uretilmis JSON dosyasini
 * okur, senaryo bazinda threshold karsilastirmasi yapar ve
 * Markdown + JSON rapor yazar. Tenant izolasyonu ve PII
 * gereksinimlerine uyar.
 *
 * Threshold degerleri ortam degiskenleri ile override
 * edilebilir (bkz. config.applyThresholdEnvOverrides).
 *
 * Kullanim:
 *   pnpm --filter @vetniva/load-test report -- --summary=./summary.json --profile=pilot --base-url=http://localhost:3001
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  SCENARIOS,
  LOAD_PROFILES,
  applyThresholdEnvOverrides,
} from "./config.js";
import { evaluateScenario } from "./thresholds.js";
import { buildReport, reportToJson, reportToMarkdown } from "./report.js";
import type {
  K6Summary,
  LoadProfile,
  ScenarioConfig,
  ScenarioResult,
} from "./types.js";

interface Args {
  summary: string;
  profile: LoadProfile;
  baseUrl: string;
  outJson: string;
  outMd: string;
  durationMs: number | null;
}

function parseArgs(argv: ReadonlyArray<string>): Args {
  const args: Args = {
    summary: "./summary.json",
    profile: "pilot",
    baseUrl: "http://localhost:3001",
    outJson: "./load-test-report.json",
    outMd: "./load-test-report.md",
    durationMs: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string | undefined => {
      const v = argv[++i];
      return typeof v === "string" ? v : undefined;
    };
    if (a === "--summary") {
      const v = next();
      if (v) args.summary = v;
    } else if (a.startsWith("--summary=")) {
      const v = a.split("=")[1];
      if (v) args.summary = v;
    } else if (a === "--profile") {
      const v = next();
      if (v && (LOAD_PROFILES as ReadonlyArray<string>).includes(v)) {
        args.profile = v as LoadProfile;
      }
    } else if (a.startsWith("--profile=")) {
      const v = a.split("=")[1];
      if (v && (LOAD_PROFILES as ReadonlyArray<string>).includes(v)) {
        args.profile = v as LoadProfile;
      }
    } else if (a === "--base-url") {
      const v = next();
      if (v) args.baseUrl = v;
    } else if (a.startsWith("--base-url=")) {
      const v = a.split("=")[1];
      if (v) args.baseUrl = v;
    } else if (a === "--out-json") {
      const v = next();
      if (v) args.outJson = v;
    } else if (a.startsWith("--out-json=")) {
      const v = a.split("=")[1];
      if (v) args.outJson = v;
    } else if (a === "--out-md") {
      const v = next();
      if (v) args.outMd = v;
    } else if (a.startsWith("--out-md=")) {
      const v = a.split("=")[1];
      if (v) args.outMd = v;
    } else if (a === "--duration-ms") {
      const v = next();
      if (v) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) args.durationMs = n;
      }
    } else if (a.startsWith("--duration-ms=")) {
      const v = a.split("=")[1];
      if (v) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) args.durationMs = n;
      }
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const summaryPath = resolve(args.summary);
  const raw = await readFile(summaryPath, "utf8");
  const summary = JSON.parse(raw) as K6Summary;

  const results: ScenarioResult[] = SCENARIOS.map((s) => {
    // Env override uygulanmis threshold ile karsilastir.
    const effective: ScenarioConfig = {
      ...s,
      thresholds: applyThresholdEnvOverrides(s.thresholds, {
        profile: args.profile,
        scenarioKey: s.key,
      }),
    };
    return evaluateScenario(effective, summary, args.profile, args.durationMs);
  });

  const report = buildReport({
    profile: args.profile,
    baseUrl: args.baseUrl,
    results,
  });

  await writeFile(resolve(args.outJson), reportToJson(report), "utf8");
  await writeFile(resolve(args.outMd), reportToMarkdown(report), "utf8");

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        outJson: args.outJson,
        outMd: args.outMd,
        allPassed: report.allPassed,
        passedCount: report.passedCount,
        failedCount: report.failedCount,
      },
      null,
      2,
    ),
  );

  if (!report.allPassed) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("report hatasi:", err);
  process.exitCode = 1;
});
