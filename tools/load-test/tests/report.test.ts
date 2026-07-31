/**
 * @file report.test.ts — rapor uretici testleri.
 * @module @vetniva/load-test/tests/report
 *
 * @description buildReport, reportToMarkdown, reportToJson
 * cikti formatlarinin dogru oldugunu dogrular. Tenant izolasyonu
 * ve PII kurallarina uyar.
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import { describe, it, expect } from "vitest";

import { buildReport, reportToMarkdown, reportToJson } from "../src/report.js";
import type { LoadTestReport, ScenarioResult } from "../src/types.js";

function mkResult(
  key: string,
  passed: boolean,
  partial?: Partial<ScenarioResult>,
): ScenarioResult {
  return {
    scenario: key as never,
    title: key,
    profile: "pilot",
    p95Ms: 200,
    p99Ms: 400,
    errorRate: 0.001,
    rps: 25,
    passed,
    failures: passed
      ? []
      : [
          {
            metric: "p95",
            expected: "<= 500 ms",
            actual: 700,
            reason: "p95 latency 500 ms esigini asti",
          },
        ],
    ...partial,
  };
}

describe("buildReport", () => {
  it("tum senaryolar gectiyse allPassed:true", () => {
    const r = buildReport({
      profile: "pilot",
      baseUrl: "http://x",
      results: [mkResult("a", true), mkResult("b", true)],
    });
    expect(r.allPassed).toBe(true);
    expect(r.passedCount).toBe(2);
    expect(r.failedCount).toBe(0);
  });

  it("bir senaryo kalirsa allPassed:false", () => {
    const r = buildReport({
      profile: "pilot",
      baseUrl: "http://x",
      results: [mkResult("a", true), mkResult("b", false)],
    });
    expect(r.allPassed).toBe(false);
    expect(r.passedCount).toBe(1);
    expect(r.failedCount).toBe(1);
  });

  it("sonuc bossa allPassed:false (falsey guard)", () => {
    const r = buildReport({
      profile: "pilot",
      baseUrl: "http://x",
      results: [],
    });
    expect(r.allPassed).toBe(false);
    expect(r.passedCount).toBe(0);
    expect(r.failedCount).toBe(0);
  });

  it("runAt verilmezse simdi kullanilir", () => {
    const r = buildReport({
      profile: "pilot",
      baseUrl: "http://x",
      results: [mkResult("a", true)],
    });
    expect(r.runAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("runAt override edilir", () => {
    const r = buildReport({
      profile: "pilot",
      baseUrl: "http://x",
      results: [mkResult("a", true)],
      runAt: "2026-08-01T00:00:00.000Z",
    });
    expect(r.runAt).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("reportToMarkdown", () => {
  it("PASS durumunda baslik ve tabloyu icerir", () => {
    const r: LoadTestReport = {
      runAt: "2026-08-01T00:00:00.000Z",
      profile: "pilot",
      baseUrl: "http://x",
      scenarios: [mkResult("patient_search", true)],
      allPassed: true,
      passedCount: 1,
      failedCount: 0,
    };
    const md = reportToMarkdown(r);
    expect(md).toContain("# Performans ve Yuk Testi Raporu");
    expect(md).toContain("PASS");
    expect(md).toContain("| Senaryo | Profil |");
    expect(md).toContain("patient_search");
  });

  it("FAIL durumunda ihlal detaylari bolumunu icerir", () => {
    const r: LoadTestReport = {
      runAt: "2026-08-01T00:00:00.000Z",
      profile: "pilot",
      baseUrl: "http://x",
      scenarios: [mkResult("patient_search", false)],
      allPassed: false,
      passedCount: 0,
      failedCount: 1,
    };
    const md = reportToMarkdown(r);
    expect(md).toContain("FAIL");
    expect(md).toContain("## Ihlal Detaylari");
    expect(md).toContain("p95");
    expect(md).toContain("p95 latency 500 ms esigini asti");
  });
});

describe("reportToJson", () => {
  it("JSON gecerli ve orijinal alanlari tasir", () => {
    const r: LoadTestReport = {
      runAt: "2026-08-01T00:00:00.000Z",
      profile: "pilot",
      baseUrl: "http://x",
      scenarios: [mkResult("a", true), mkResult("b", false)],
      allPassed: false,
      passedCount: 1,
      failedCount: 1,
    };
    const j = JSON.parse(reportToJson(r)) as LoadTestReport;
    expect(j.allPassed).toBe(false);
    expect(j.scenarios).toHaveLength(2);
    expect(j.scenarios[0].passed).toBe(true);
    expect(j.scenarios[1].passed).toBe(false);
  });
});
