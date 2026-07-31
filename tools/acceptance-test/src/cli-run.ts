/**
 * @file Pilot kabul (UAT) senaryo calistirma CLI.
 * @module @vetniva/acceptance-test/cli-run
 *
 * @description GOAL-121 (FAZ-12) kapsaminda secili senaryoyu
 * veya tum senaryolari sirayla calistirir. Sonucu JSON
 * formatinda stdout'a yazar (rapor olusturmak icin
 * cli-report.ts kullanilir).
 *
 * Kullanim:
 *   pnpm --filter @vetniva/acceptance-test run -- --base=http://localhost:3001 --token=... --tenant=... --branch=... --scenario=new_owner_patient
 *   pnpm --filter @vetniva/acceptance-test run -- --base=http://localhost:3001 --out=./uat-result.json
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SCENARIOS, getScenario, listScenarioKeys } from "./config.js";
import { runScenario, type UatAuthContext } from "./runner.js";
import type { UatRunResult, UatScenarioKey } from "./types.js";

interface CliArgs {
  base: string;
  token: string;
  tenant: string;
  branch: string;
  scenario: UatScenarioKey | "all";
  operator: string;
  out: string;
}

const SCENARIO_KEYS: ReadonlyArray<string> = listScenarioKeys();

function parseArgs(argv: ReadonlyArray<string>): CliArgs {
  const args: CliArgs = {
    base: process.env.UAT_BASE_URL ?? "http://localhost:3001",
    token: process.env.UAT_TOKEN ?? "",
    tenant: process.env.UAT_TENANT_ID ?? "",
    branch: process.env.UAT_BRANCH_ID ?? "",
    scenario: "all",
    operator: process.env.UAT_OPERATOR ?? "pilot-cli",
    out: process.env.UAT_OUT ?? "./uat-result.json",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const consume = (): string | undefined => {
      const v = argv[++i];
      return v;
    };
    if (a === "--base") { const v = consume(); args.base = v ?? args.base; }
    else if (a.startsWith("--base=")) args.base = a.split("=")[1] ?? args.base;
    else if (a === "--token") { const v = consume(); args.token = v ?? args.token; }
    else if (a.startsWith("--token=")) args.token = a.split("=")[1] ?? args.token;
    else if (a === "--tenant") { const v = consume(); args.tenant = v ?? args.tenant; }
    else if (a.startsWith("--tenant=")) args.tenant = a.split("=")[1] ?? args.tenant;
    else if (a === "--branch") { const v = consume(); args.branch = v ?? args.branch; }
    else if (a.startsWith("--branch=")) args.branch = a.split("=")[1] ?? args.branch;
    else if (a === "--operator") { const v = consume(); args.operator = v ?? args.operator; }
    else if (a.startsWith("--operator=")) args.operator = a.split("=")[1] ?? args.operator;
    else if (a === "--out") { const v = consume(); args.out = v ?? args.out; }
    else if (a.startsWith("--out=")) args.out = a.split("=")[1] ?? args.out;
    else if (a === "--scenario") {
      const v = consume() ?? "";
      if (v === "all" || (SCENARIO_KEYS as ReadonlyArray<string>).includes(v)) {
        args.scenario = v as CliArgs["scenario"];
      }
    } else if (a.startsWith("--scenario=")) {
      const v = a.split("=")[1] ?? "";
      if (v === "all" || (SCENARIO_KEYS as ReadonlyArray<string>).includes(v)) {
        args.scenario = v as CliArgs["scenario"];
      }
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const auth: UatAuthContext = {
    token: args.token,
    tenantId: args.tenant,
    branchId: args.branch,
  };

  const scenarios =
    args.scenario === "all"
      ? SCENARIOS
      : [getScenario(args.scenario)];

  const runAt = new Date().toISOString();
  const scenarioResults = [];
  let initialContext: Record<string, string> = {};
  for (const sc of scenarios) {
    const res = await runScenario({
      scenario: sc,
      baseUrl: args.base,
      auth,
      initialContext,
    });
    scenarioResults.push(res);
    // Basarili senaryodan sonra id'leri sonraki senaryoya
    // aktar (sirali pilot akisi).
    if (res.allPassed) {
      const last = res.steps[res.steps.length - 1];
      initialContext = { ...last?.extracted };
    }
  }

  const passedCount = scenarioResults.filter((s) => s.allPassed).length;
  const failedCount = scenarioResults.length - passedCount;
  const totalSteps = scenarioResults.reduce((s, sc) => s + sc.steps.length, 0);
  const totalFailedSteps = scenarioResults.reduce(
    (s, sc) => s + sc.failedCount,
    0,
  );
  const totalUnnecessary = scenarioResults.reduce(
    (s, sc) => s + sc.unnecessaryCount,
    0,
  );
  const ratings = scenarioResults
    .flatMap((s) => s.steps.map((st) => st.feedback?.rating ?? 0))
    .filter((r) => r > 0);
  const averageRating =
    ratings.length === 0
      ? 0
      : Math.round(
          (ratings.reduce<number>((s, r) => s + r, 0) / ratings.length) * 100,
        ) / 100;

  const result: UatRunResult = {
    runAt,
    operator: args.operator,
    baseUrl: args.base,
    tenantId: args.tenant || null,
    scenarios: scenarioResults,
    allPassed: failedCount === 0,
    passedCount,
    failedCount,
    totalSteps,
    totalFailedSteps,
    totalUnnecessary,
    averageRating,
  };

  const outFile = resolve(args.out);
  await writeFile(outFile, JSON.stringify(result, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        outFile,
        scenarios: scenarioResults.length,
        passed: passedCount,
        failed: failedCount,
        totalSteps,
        totalFailedSteps,
        totalUnnecessary,
        averageRating,
      },
      null,
      2,
    ),
  );
  if (failedCount > 0 || totalFailedSteps > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("uat-run hatasi:", err);
  process.exitCode = 1;
});
