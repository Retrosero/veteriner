/**
 * @file Guvenlik testi rapor uretici.
 * @module @vetniva/security-test/report
 *
 * @description SecurityRunReport'tan Markdown + JSON rapor
 * uretir. PASS/FAIL/SKIP tablosu + severity dagilimi + her
 * FAIL icin remediation hatirlatmasi icerir. Tenant izolasyonu,
 * PII ve audit kurallarina uyar.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import type {
  SecurityRunReport,
  SecurityResult,
  SecuritySeverity,
} from "./types.js";

/** Markdown formatinda insan-okur rapor uretir. */
export function reportToMarkdown(report: SecurityRunReport): string {
  const lines: string[] = [];
  lines.push("# Guvenlik Testi Raporu (GOAL-123)");
  lines.push("");
  lines.push(`- **Calistirilma zamani:** ${report.runAt}`);
  lines.push(`- **Base URL:** ${report.baseUrl}`);
  if (report.crossTenantId) {
    lines.push(`- **Cross-tenant test kimligi:** ${report.crossTenantId}`);
  }
  lines.push(
    `- **Sonuc:** ${report.allPassed ? "PASS" : "FAIL"} (${report.passCount} PASS / ${report.failCount} FAIL / ${report.skipCount} SKIP)`,
  );
  lines.push("");

  // Severity ozet
  lines.push("## Severity Ozeti (FAIL dagilimi)");
  lines.push("");
  lines.push("| Seviye | Sayi |");
  lines.push("|---|---|");
  for (const sev of [
    "critical",
    "high",
    "medium",
    "low",
    "info",
  ] as SecuritySeverity[]) {
    lines.push(`| ${sev} | ${report.bySeverity[sev]} |`);
  }
  lines.push("");

  // ASVS severity tutarlilik ozeti
  if (report.severityReport) {
    const sr = report.severityReport;
    lines.push("## ASVS + Severity Tutarliligi");
    lines.push("");
    lines.push(`- **Toplam kontrol:** ${sr.total}`);
    lines.push(`- **Tutarli:** ${sr.consistent}`);
    lines.push(`- **Tutarsiz:** ${sr.inconsistent}`);
    lines.push(`- **En uzun SLA:** ${sr.topSlaDays} gun`);
    if (sr.inconsistent > 0) {
      lines.push(
        "- **UYARI:** ASVS seviyesi ile severity uyumsuz; katalog gozden gecirilmeli.",
      );
    }
    lines.push("");
  }

  // PASS/FAIL/SKIP tablosu
  lines.push("## Kontrol Sonuclari");
  lines.push("");
  lines.push("| Kontrol | Kategori | ASVS | Severity | Status | Mesaj |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of report.results) {
    const msg = r.message.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(
      `| ${r.check} | ${r.control} | ${r.asvsLevel} | ${r.severity} | ${r.status.toUpperCase()} | ${msg} |`,
    );
  }
  lines.push("");

  // Remediation
  const failed = report.results.filter((r) => r.status === "fail");
  if (failed.length > 0) {
    lines.push("## Remediation Plani");
    lines.push("");
    for (const r of failed) {
      lines.push(`### ${r.check} (${r.title}) — ${r.severity.toUpperCase()}`);
      lines.push("");
      lines.push(`- **Kategori:** ${r.control}`);
      lines.push(`- **ASVS:** ${r.asvsLevel}`);
      lines.push(`- **Mesaj:** ${r.message}`);
      if (r.observedStatus !== undefined) {
        lines.push(`- **Gozlemlenen status:** ${r.observedStatus}`);
      }
      if (r.expectedStatuses) {
        lines.push(
          `- **Beklenen statuslar:** ${r.expectedStatuses.join(" / ")}`,
        );
      }
      if (r.remediation) {
        lines.push(`- **Onerilen remediation:** ${r.remediation}`);
      }
      lines.push("");
    }
  }

  // Skipped
  const skipped = report.results.filter((r) => r.status === "skip");
  if (skipped.length > 0) {
    lines.push("## Atlanan Kontroller");
    lines.push("");
    for (const r of skipped) {
      lines.push(`- **${r.check}** (${r.title}): ${r.message}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** JSON formatinda rapor. */
export function reportToJson(report: SecurityRunReport): string {
  return JSON.stringify(report, null, 2);
}

/** Tek bir sonuc icin kisa insan-okur cumlesi. */
export function describeResult(r: SecurityResult): string {
  if (r.status === "pass") {
    return `PASS ${r.check} (${r.control}/${r.asvsLevel})`;
  }
  if (r.status === "skip") {
    return `SKIP ${r.check}: ${r.message}`;
  }
  return `FAIL ${r.check} (${r.control}/${r.asvsLevel}, ${r.severity}): ${r.message}`;
}
