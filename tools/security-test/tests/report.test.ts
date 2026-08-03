/**
 * @file report.test.ts — guvenlik rapor uretici testleri.
 * @module @vetniva/security-test/tests/report
 *
 * @description reportToMarkdown'in tablo + severity ozet
 * + remediation planini dogru urettigini, reportToJson'in
 * gecerli JSON oldugunu dogrular. Tenant izolasyonu ve
 * PII kurallarina uyar.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { describe, it, expect } from "vitest";

import {
  reportToMarkdown,
  reportToJson,
  describeResult,
} from "../src/report.js";
import type { SecurityRunReport } from "../src/types.js";

const BASE_REPORT: SecurityRunReport = {
  runAt: "2026-08-03T10:00:00.000Z",
  baseUrl: "http://localhost:3001",
  results: [
    {
      check: "auth_brute_force_lockout",
      control: "auth",
      asvsLevel: "L2",
      title: "Brute-force korumasi",
      status: "pass",
      severity: "high",
      message: "Tum 2 adim beklenen status kosullarini karsiladi.",
    },
    {
      check: "idor_cross_tenant_patient",
      control: "idor",
      asvsLevel: "L1",
      title: "IDOR (cross-tenant patient)",
      status: "fail",
      severity: "critical",
      observedStatus: 200,
      expectedStatuses: [404],
      message:
        "step=cross_tenant_patient_timeline beklenen status 404 alinan 200",
      remediation: "TenantId filtresi zorunlu kilin.",
    },
  ],
  passCount: 1,
  failCount: 1,
  skipCount: 0,
  bySeverity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
  allPassed: false,
};

describe("reportToMarkdown", () => {
  it("PASS/FAIL/SKIP tablosu + severity ozet icerir", () => {
    const md = reportToMarkdown(BASE_REPORT);
    expect(md).toContain("Guvenlik Testi Raporu");
    expect(md).toContain("Severity Ozeti");
    expect(md).toContain("Kontrol Sonuclari");
    expect(md).toContain("auth_brute_force_lockout");
    expect(md).toContain("idor_cross_tenant_patient");
  });

  it("FAIL olan kontroller icin Remediation Plani uretir", () => {
    const md = reportToMarkdown(BASE_REPORT);
    expect(md).toContain("Remediation Plani");
    expect(md).toContain("TenantId filtresi zorunlu kilin");
    expect(md).toContain("CRITICAL");
  });

  it("PASS kontrolleri icin remediation blogu uretmez", () => {
    const onlyPass: SecurityRunReport = {
      ...BASE_REPORT,
      results: [
        {
          check: "x",
          control: "auth",
          asvsLevel: "L1",
          title: "t",
          status: "pass",
          severity: "low",
          message: "ok",
        },
      ],
      passCount: 1,
      failCount: 0,
      allPassed: true,
    };
    const md = reportToMarkdown(onlyPass);
    expect(md).not.toContain("Remediation Plani");
  });

  it("SKIP kontrolleri icin Atlanan Kontroller bolumu uretir", () => {
    const withSkip: SecurityRunReport = {
      ...BASE_REPORT,
      results: [
        ...BASE_REPORT.results,
        {
          check: "csrf_state_changing_token",
          control: "csrf",
          asvsLevel: "L2",
          title: "CSRF",
          status: "skip",
          severity: "medium",
          message: "skipByDefault",
        },
      ],
      skipCount: 1,
    };
    const md = reportToMarkdown(withSkip);
    expect(md).toContain("Atlanan Kontroller");
    expect(md).toContain("csrf_state_changing_token");
  });
});

describe("reportToJson", () => {
  it("raporu gecerli JSON olarak uretir", () => {
    const j = reportToJson(BASE_REPORT);
    const parsed = JSON.parse(j) as SecurityRunReport;
    expect(parsed.allPassed).toBe(false);
    expect(parsed.results.length).toBe(2);
  });
});

describe("describeResult", () => {
  it("PASS kontrolleri icin kisa cumle uretir", () => {
    const r = BASE_REPORT.results[0]!;
    const out = describeResult(r);
    expect(out).toContain("PASS");
    expect(out).toContain(r.check);
  });

  it("FAIL kontrolleri icin severity + mesaj icerir", () => {
    const r = BASE_REPORT.results[1]!;
    const out = describeResult(r);
    expect(out).toContain("FAIL");
    expect(out).toContain("critical");
    expect(out).toContain("beklenen status 404");
  });

  it("SKIP kontrolleri icin neden icerir", () => {
    const skip = {
      check: "x",
      control: "csrf" as const,
      asvsLevel: "L2" as const,
      title: "t",
      status: "skip" as const,
      severity: "low" as const,
      message: "skipByDefault",
    };
    const out = describeResult(skip);
    expect(out).toContain("SKIP");
    expect(out).toContain("skipByDefault");
  });
});
