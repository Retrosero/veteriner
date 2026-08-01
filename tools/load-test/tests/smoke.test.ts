/**
 * @file smoke.test.ts — uctan uca smoke testi.
 * @module @vetniva/load-test/tests/smoke
 *
 * @description Uretim hattinin temel akisini dogrular: k6
 * script uretimi, summary okuma, threshold karsilastirmasi
 * ve rapor yazma. Tenant izolasyonu, PII ve audit kurallarina
 * uyar.
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SCENARIOS } from "../src/config.js";
import { writeAllScripts } from "../src/generator.js";
import { evaluateScenario } from "../src/thresholds.js";
import { buildReport, reportToJson, reportToMarkdown } from "../src/report.js";
import type { K6Summary, ScenarioResult } from "../src/types.js";

describe("smoke", () => {
  it("k6 script uretimi + summary okuma + rapor yazma uctan uca calisir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loadtest-smoke-"));
    try {
      // 1) k6 script uret
      await writeAllScripts(dir, "pilot", SCENARIOS);

      // 2) mock k6 summary (gercek k6 calistirilmadan)
      const summary: K6Summary = {
        metrics: {
          http_req_duration: {
            name: "http_req_duration",
            value: 0,
          },
          "http_req_duration{p(95:)}": {
            name: "http_req_duration{p(95:)}",
            value: 300,
          },
          "http_req_duration{p(99:)}": {
            name: "http_req_duration{p(99:)}",
            value: 600,
          },
          http_req_failed: {
            name: "http_req_failed",
            value: 0.0,
          },
          http_reqs: {
            name: "http_reqs",
            value: 1000,
          },
          iterations: {
            name: "iterations",
            value: 100,
          },
        },
      };
      const summaryPath = join(dir, "summary.json");
      // BOM'suz yazmak icin dogrudan UTF-8 string
      await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

      // 3) Tum senaryolari degerlendir
      const results: ScenarioResult[] = SCENARIOS.map((s) =>
        evaluateScenario(s, summary, "pilot", 20_000),
      );

      // 4) Rapor yaz
      const report = buildReport({
        profile: "pilot",
        baseUrl: "http://localhost:3001",
        results,
      });
      const reportJson = reportToJson(report);
      const reportMd = reportToMarkdown(report);

      const jsonPath = join(dir, "report.json");
      const mdPath = join(dir, "report.md");
      await writeFile(jsonPath, reportJson, "utf8");
      await writeFile(mdPath, reportMd, "utf8");

      // 5) Dogrulama
      const writtenSummary = JSON.parse(
        await readFile(summaryPath, "utf8"),
      ) as K6Summary;
      expect(writtenSummary.metrics["http_reqs"].value).toBe(1000);

      const parsedReport = JSON.parse(
        await readFile(jsonPath, "utf8"),
      ) as typeof report;
      expect(parsedReport.allPassed).toBe(true);
      expect(parsedReport.passedCount).toBe(SCENARIOS.length);

      const md = await readFile(mdPath, "utf8");
      expect(md).toContain("# Performans ve Yuk Testi Raporu");
      expect(md).toContain("PASS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
