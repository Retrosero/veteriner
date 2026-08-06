/**
 * @file severity.test.ts — OWASP ASVS severity esleme testleri.
 * @module @vetniva/security-test/tests/severity
 *
 * @description severity.ts modulu uzerinden ASVS L1/L2/L3
 * seviyeleri ile severity (critical/high/medium/low/info)
 * arasindaki eslemenin tutarliligini, SLA gunlerinin
 * (24saat/7gun/30gun/90gun) dogru hesaplandigini dogrular.
 * Tenant izolasyonu, PII ve audit kurallarina uyar.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { describe, expect, it } from "vitest";

import { SECURITY_CHECKS } from "../src/config.js";
import {
  ASVS_LEVEL_WEIGHT,
  ASVS_REFERENCES,
  MIN_ASVS_BY_CONTROL,
  SEVERITY_SLA_DAYS,
  SEVERITY_WEIGHT,
  assessSeverity,
  buildSeverityReport,
} from "../src/severity.js";

import type { SecurityResult } from "../src/types.js";

describe("ASVS_REFERENCES", () => {
  it("9 kontrol kategorisi icin ASVS referansi var", () => {
    for (const k of [
      "auth",
      "authz",
      "idor",
      "xss",
      "csrf",
      "sql_injection",
      "file_upload",
      "rate_limit",
      "tenant_isolation",
    ] as const) {
      expect(ASVS_REFERENCES[k].length, k).toBeGreaterThan(0);
    }
  });
});

describe("SEVERITY_WEIGHT siralama", () => {
  it("critical > high > medium > low > info", () => {
    expect(SEVERITY_WEIGHT.critical).toBeGreaterThan(SEVERITY_WEIGHT.high);
    expect(SEVERITY_WEIGHT.high).toBeGreaterThan(SEVERITY_WEIGHT.medium);
    expect(SEVERITY_WEIGHT.medium).toBeGreaterThan(SEVERITY_WEIGHT.low);
    expect(SEVERITY_WEIGHT.low).toBeGreaterThan(SEVERITY_WEIGHT.info);
  });
});

describe("ASVS_LEVEL_WEIGHT siralama", () => {
  it("L3 > L2 > L1", () => {
    expect(ASVS_LEVEL_WEIGHT.L3).toBeGreaterThan(ASVS_LEVEL_WEIGHT.L2);
    expect(ASVS_LEVEL_WEIGHT.L2).toBeGreaterThan(ASVS_LEVEL_WEIGHT.L1);
  });
});

describe("SEVERITY_SLA_DAYS", () => {
  it("critical=1, high=7, medium=30, low=90, info=365", () => {
    expect(SEVERITY_SLA_DAYS.critical).toBe(1);
    expect(SEVERITY_SLA_DAYS.high).toBe(7);
    expect(SEVERITY_SLA_DAYS.medium).toBe(30);
    expect(SEVERITY_SLA_DAYS.low).toBe(90);
    expect(SEVERITY_SLA_DAYS.info).toBe(365);
  });
});

describe("MIN_ASVS_BY_CONTROL", () => {
  it("9 kontrol kategorisi icin minimum ASVS seviyesi tanimli", () => {
    for (const k of [
      "auth",
      "authz",
      "idor",
      "xss",
      "csrf",
      "sql_injection",
      "file_upload",
      "rate_limit",
      "tenant_isolation",
    ] as const) {
      expect(MIN_ASVS_BY_CONTROL[k]).toBeDefined();
    }
  });

  it("IDOR ve tenant_isolation L1 (temel kontrol)", () => {
    expect(MIN_ASVS_BY_CONTROL.idor).toBe("L1");
    expect(MIN_ASVS_BY_CONTROL.tenant_isolation).toBe("L1");
  });

  it("Auth, CSRF, file_upload, rate_limit L2 (hassas veri)", () => {
    expect(MIN_ASVS_BY_CONTROL.auth).toBe("L2");
    expect(MIN_ASVS_BY_CONTROL.csrf).toBe("L2");
    expect(MIN_ASVS_BY_CONTROL.file_upload).toBe("L2");
    expect(MIN_ASVS_BY_CONTROL.rate_limit).toBe("L2");
  });
});

describe("assessSeverity", () => {
  it("IDOR + L1 + critical: consistent", () => {
    const a = assessSeverity("idor", "L1", "critical");
    expect(a.consistent).toBe(true);
    expect(a.slaDays).toBe(1);
  });

  it("IDOR + L1 + low: inconsistent (high risk kategorisi icin dusuk)", () => {
    const a = assessSeverity("idor", "L1", "low");
    expect(a.consistent).toBe(false);
  });

  it("XSS + L1 + high: consistent", () => {
    const a = assessSeverity("xss", "L1", "high");
    expect(a.consistent).toBe(true);
  });

  it("CSRF + L2 + medium: consistent", () => {
    const a = assessSeverity("csrf", "L2", "medium");
    expect(a.consistent).toBe(true);
  });

  it("Auth + L1 + critical: inconsistent (auth min L2)", () => {
    const a = assessSeverity("auth", "L1", "critical");
    expect(a.consistent).toBe(false);
  });

  it("Auth + L2 + high: consistent", () => {
    const a = assessSeverity("auth", "L2", "high");
    expect(a.consistent).toBe(true);
  });
});

describe("buildSeverityReport", () => {
  it("Tum SECURITY_CHECKS uzerinden severity rapor uretir", () => {
    const results: SecurityResult[] = SECURITY_CHECKS.map((c) => ({
      check: c.key,
      control: c.control,
      asvsLevel: c.asvsLevel,
      title: c.title,
      status: "pass" as const,
      severity: c.failureSeverity,
      message: "ok",
    }));
    const report = buildSeverityReport(results);
    expect(report.total).toBe(SECURITY_CHECKS.length);
    expect(report.topSlaDays).toBeGreaterThan(0);
  });

  it("Tutarsiz (inconsistent) kontroller 0 olmali (katalog temiz)", () => {
    const results: SecurityResult[] = SECURITY_CHECKS.map((c) => ({
      check: c.key,
      control: c.control,
      asvsLevel: c.asvsLevel,
      title: c.title,
      status: "pass" as const,
      severity: c.failureSeverity,
      message: "ok",
    }));
    const report = buildSeverityReport(results);
    expect(report.inconsistent).toBe(0);
    expect(report.consistent).toBe(report.total);
  });
});
