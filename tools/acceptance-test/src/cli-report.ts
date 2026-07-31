/**
 * @file Pilot kabul (UAT) rapor olusturma CLI.
 * @module @vetniva/acceptance-test/cli-report
 *
 * @description GOAL-121 (FAZ-12) kapsaminda cli-run.ts'in
 * urettigi JSON sonucu okuyup Markdown + JSON rapora
 * cevirir. Hata olayi uretmez; sadece dosya yazma.
 *
 * Kullanim:
 *   pnpm --filter @vetniva/acceptance-test report -- --in=./uat-result.json --md=./uat-report.md --json=./uat-report.json
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildReport } from "./report.js";
import type { UatRunResult } from "./types.js";

interface CliArgs {
  in: string;
  md: string;
  json: string;
}

function parseArgs(argv: ReadonlyArray<string>): CliArgs {
  const args: CliArgs = {
    in: process.env.UAT_IN ?? "./uat-result.json",
    md: process.env.UAT_MD ?? "./uat-report.md",
    json: process.env.UAT_JSON ?? "./uat-report.json",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const consume = (): string | undefined => argv[++i];
    if (a === "--in") args.in = consume() ?? args.in;
    else if (a.startsWith("--in=")) args.in = a.split("=")[1] ?? args.in;
    else if (a === "--md") args.md = consume() ?? args.md;
    else if (a.startsWith("--md=")) args.md = a.split("=")[1] ?? args.md;
    else if (a === "--json") args.json = consume() ?? args.json;
    else if (a.startsWith("--json=")) args.json = a.split("=")[1] ?? args.json;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inFile = resolve(args.in);
  const raw = await readFile(inFile, "utf8");
  const result = JSON.parse(raw) as UatRunResult;
  const { markdown, json } = buildReport(result);
  const mdFile = resolve(args.md);
  const jsonFile = resolve(args.json);
  await writeFile(mdFile, markdown, "utf8");
  await writeFile(jsonFile, json, "utf8");
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        in: inFile,
        md: mdFile,
        json: jsonFile,
        scenarios: result.scenarios.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("uat-report hatasi:", err);
  process.exitCode = 1;
});
