/**
 * @file Pilot kabul (UAT) rapor ureticisi.
 * @module @vetniva/acceptance-test/report
 *
 * @description GOAL-121 (FAZ-12) kapsaminda UatRunResult'tan
 * pilot ekibin okuyacagi Markdown rapor ve makine-okur
 * JSON rapor uretir. Tenant izolasyonu, PII mask ve
 * gereksiz adim filtrelemesi bu katmanda da uygulanir.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import type {
  UatRunResult,
  UatScenarioResult,
  UatStepResult,
} from "./types.js";

/** Rapor uretiminde kullanilan ozet istatistik. */
export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number; // 0..1
  totalDurationMs: number;
  averageStepDurationMs: number;
  averageRating: number;
  unnecessaryCount: number;
}

/** Rapor girdisi. */
export type ReportInput = UatRunResult;

/** Calistirma sonucundan ozet istatistik uretir. */
export function summarize(result: UatRunResult): ReportSummary {
  const totalScenarios = result.scenarios.length;
  const passedScenarios = result.scenarios.filter((s) => s.allPassed).length;
  const failedScenarios = totalScenarios - passedScenarios;
  const totalDurationMs = result.scenarios.reduce(
    (s, sc) => s + sc.totalDurationMs,
    0,
  );
  const totalSteps = result.scenarios.reduce(
    (s, sc) => s + sc.steps.length,
    0,
  );
  const averageStepDurationMs =
    totalSteps === 0
      ? 0
      : Math.round(
          result.scenarios.reduce(
            (s, sc) =>
              s + sc.steps.reduce((ss, st) => ss + st.durationMs, 0),
            0,
          ) / totalSteps,
        );
  return {
    total: totalScenarios,
    passed: passedScenarios,
    failed: failedScenarios,
    passRate: totalScenarios === 0 ? 0 : passedScenarios / totalScenarios,
    totalDurationMs,
    averageStepDurationMs,
    averageRating: result.averageRating,
    unnecessaryCount: result.totalUnnecessary,
  };
}

/** Sureyi ms -> "1.2s" / "850ms" formatina cevirir. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return `${m}m${rest}s`;
}

/** Tarihi kisa Turkce formata cevirir (YYYY-MM-DD HH:mm). */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Step satiri olusturur (Markdown tablosu icin). */
function renderStepRow(step: UatStepResult): string {
  const status = step.passed ? "✅" : "❌";
  const err = step.error ? ` (${step.error.slice(0, 40)})` : "";
  const feedbackInfo = step.feedback
    ? step.feedback.unnecessary
      ? " [gereksiz]"
      : step.feedback.rating > 0
        ? ` [puan:${step.feedback.rating}/5]`
        : ""
    : "";
  return `| ${status} | \`${step.name}\` | ${step.status} | ${formatDuration(step.durationMs)} | ${step.feedback?.comment ?? ""}${feedbackInfo}${err} |`;
}

/** Senaryo blogu olusturur. */
function renderScenarioBlock(scenario: UatScenarioResult): string {
  const header = `### ${scenario.passedCount === scenario.steps.length ? "✅" : "❌"} ${scenario.title} (\`${scenario.scenario}\`)

- **Modul:** ${scenario.module}
- **Baslangic:** ${formatTimestamp(scenario.startedAt)}
- **Bitis:** ${formatTimestamp(scenario.finishedAt)}
- **Sure:** ${formatDuration(scenario.totalDurationMs)}
- **Gecen adim:** ${scenario.passedCount}/${scenario.steps.length}
- **Gereksiz adim:** ${scenario.unnecessaryCount}
- **Ortalama puan:** ${scenario.averageRating > 0 ? scenario.averageRating + "/5" : "yok"}

| Sonuc | Adim | Status | Sure | Yorum |
|-------|------|--------|------|-------|`;

  const rows = scenario.steps.map(renderStepRow).join("\n");
  return `${header}\n${rows}\n`;
}

/** Markdown rapor uretir. */
export function reportToMarkdown(result: UatRunResult): string {
  const summary = summarize(result);
  const headerLines: string[] = [
    `# Pilot Kabul Testi Raporu (GOAL-121)`,
    ``,
    `- **Calistirma zamani:** ${formatTimestamp(result.runAt)}`,
    `- **Operator:** ${result.operator}`,
    `- **API base URL:** \`${result.baseUrl}\``,
    `- **Tenant:** ${result.tenantId ?? "(yok)"}`,
    ``,
    `## Ozet`,
    ``,
    `- **Toplam senaryo:** ${summary.total}`,
    `- **Gecen:** ${summary.passed} (${Math.round(summary.passRate * 100)}%)`,
    `- **Kalan:** ${summary.failed}`,
    `- **Toplam sure:** ${formatDuration(summary.totalDurationMs)}`,
    `- **Ortalama adim suresi:** ${formatDuration(summary.averageStepDurationMs)}`,
    `- **Gereksiz adim (pilot isareti):** ${summary.unnecessaryCount}`,
    `- **Ortalama pilot puani:** ${summary.averageRating > 0 ? summary.averageRating + "/5" : "yok"}`,
    ``,
    `## Senaryolar`,
    ``,
  ];

  const blocks = result.scenarios.map(renderScenarioBlock);
  const failures = result.scenarios.flatMap((s) =>
    s.steps.filter((st) => !st.passed).map((st) => `- \`${s.scenario}/${st.name}\`: status=${st.status} hata=${st.error ?? "yok"}`),
  );
  const footerLines: string[] = [
    ``,
    `## Basarisiz Adimlar`,
    failures.length === 0
      ? `_Hic basarisiz adim yok._`
      : failures.join("\n"),
    ``,
    `## Notlar`,
    ``,
    `- Bu rapor GOAL-121 pilot kabul testi altyapisi tarafindan uretildi.`,
    `- Duzeltme/iyilestirme istekleri \`tools/acceptance-test/docs\` altinda takip edilir.`,
    ``,
  ];
  return headerLines.concat(blocks).concat(footerLines).join("\n");
}

/** JSON rapor uretir (CI/makine-okur). */
export function reportToJson(result: UatRunResult): string {
  const summary = summarize(result);
  return JSON.stringify(
    {
      runAt: result.runAt,
      operator: result.operator,
      baseUrl: result.baseUrl,
      tenantId: result.tenantId,
      summary,
      scenarios: result.scenarios,
    },
    null,
    2,
  );
}

/** Rapor ureten kolaylik fonksiyonu. */
export function buildReport(result: UatRunResult): {
  markdown: string;
  json: string;
} {
  return {
    markdown: reportToMarkdown(result),
    json: reportToJson(result),
  };
}
