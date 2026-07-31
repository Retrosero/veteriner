/**
 * @file k6 script dogrulama CLI.
 * @module @vetniva/load-test/cli-validate
 *
 * @description Tum senaryolar icin k6 script uretir ve dosya
 * sisteminin yazilabilir oldugunu dogrular. Tenant izolasyonu
 * ve PII gereksinimlerine uyar.
 *
 * Kullanim:
 *   pnpm --filter @vetniva/load-test validate
 *   pnpm --filter @vetniva/load-test validate -- --profile=pilot --out=./dist/k6
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import { resolve } from "node:path";

import { SCENARIOS, LOAD_PROFILES } from "./config.js";
import { writeAllScripts, listJsFiles } from "./generator.js";
import type { LoadProfile } from "./types.js";

interface Args {
  profile: LoadProfile;
  out: string;
}

function parseArgs(argv: ReadonlyArray<string>): Args {
  let profile: LoadProfile = "pilot";
  let out = "./dist/k6";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile") {
      const v = argv[++i];
      if (v && (LOAD_PROFILES as ReadonlyArray<string>).includes(v)) {
        profile = v as LoadProfile;
      }
    } else if (a.startsWith("--profile=")) {
      const v = a.split("=")[1];
      if (v && (LOAD_PROFILES as ReadonlyArray<string>).includes(v)) {
        profile = v as LoadProfile;
      }
    } else if (a === "--out") {
      const v = argv[++i];
      if (v) out = v;
    } else if (a.startsWith("--out=")) {
      const v = a.split("=")[1];
      if (v) out = v;
    }
  }
  return { profile, out };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);

  const written = await writeAllScripts(outDir, args.profile, SCENARIOS);
  const files = await listJsFiles(outDir);

  // Basit sanity: her senaryo + shared.js yazildi mi?
  const expected = new Set<string>([...SCENARIOS.map((s) => `${s.key}.js`), "shared.js"]);
  const actual = new Set<string>(files);
  const missing: string[] = [];
  for (const e of expected) {
    if (!actual.has(e)) missing.push(e);
  }

  // Sonuc
  const summary = {
    profile: args.profile,
    outDir,
    written: written.map((w) => w.file),
    expected: Array.from(expected).sort(),
    missing: missing.sort(),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  if (missing.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("validate hatasi:", err);
  process.exitCode = 1;
});
