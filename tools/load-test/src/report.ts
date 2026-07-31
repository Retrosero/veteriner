/**
 * @file Rapor uretici ve toplayici.
 * @module @vetniva/load-test/report
 *
 * @description Birden fazla senaryo sonucunu toplar, Markdown
 * ve JSON formatinda rapor cikti uretir. Tum uretim sarti
 * tenant izolasyonu, PII ve audit gereksinimlerine uyar.
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import type { LoadTestReport, ScenarioResult } from "./types.js";

/** Rapor giriş verisi. */
export interface ReportInput {
  profile: LoadTestReport["profile"];
  baseUrl: string;
  results: ReadonlyArray<ScenarioResult>;
  runAt?: string;
}

/**
 * Senaryo sonuclarindan toplu LoadTestReport uretir.
 * Tarih yoksa simdi (ISO) kullanir.
 */
export function buildReport(input: ReportInput): LoadTestReport {
  const runAt = input.runAt ?? new Date().toISOString();
  const passedCount = input.results.filter((r) => r.passed).length;
  const failedCount = input.results.length - passedCount;
  return {
    runAt,
    profile: input.profile,
    baseUrl: input.baseUrl,
    scenarios: input.results,
    allPassed: failedCount === 0 && input.results.length > 0,
    passedCount,
    failedCount,
  };
}

/** Markdown formatinda insan-okur rapor uretir. */
export function reportToMarkdown(report: LoadTestReport): string {
  const lines: string[] = [];
  lines.push(`# Performans ve Yuk Testi Raporu`);
  lines.push("");
  lines.push(`- **Calistirilma zamani:** ${report.runAt}`);
  lines.push(`- **Profil:** ${report.profile}`);
  lines.push(`- **Base URL:** ${report.baseUrl}`);
  lines.push(
    `- **Sonuc:** ${report.allPassed ? "PASS" : "FAIL"} (${report.passedCount}/${report.scenarios.length} senaryo gecti)`,
  );
  lines.push("");
  lines.push("## Senaryo Sonuclari");
  lines.push("");
  lines.push(
    "| Senaryo | Profil | p95 (ms) | p99 (ms) | Hata % | RPS | Sonuc |",
  );
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of report.scenarios) {
    const p95 = r.p95Ms === null ? "-" : r.p95Ms.toFixed(0);
    const p99 = r.p99Ms === null ? "-" : r.p99Ms.toFixed(0);
    const errPct = (r.errorRate * 100).toFixed(2);
    const rps = r.rps === 0 ? "-" : r.rps.toFixed(2);
    const status = r.passed ? "PASS" : "FAIL";
    lines.push(
      `| ${r.scenario} | ${r.profile} | ${p95} | ${p99} | ${errPct} | ${rps} | ${status} |`,
    );
  }
  lines.push("");

  const failed = report.scenarios.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push("## Ihlal Detaylari");
    lines.push("");
    for (const r of failed) {
      lines.push(`### ${r.scenario} (${r.title})`);
      for (const f of r.failures) {
        lines.push(
          `- **${f.metric}**: beklenen \`${f.expected}\`, olculen \`${f.actual ?? "-"}\` — ${f.reason}`,
        );
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** Kompakt JSON rapor uretir. */
export function reportToJson(report: LoadTestReport): string {
  return JSON.stringify(report, null, 2);
}
