/**
 * @file smoke.test.ts — uctan uca smoke testi.
 * @module @vetniva/security-test/tests/smoke
 *
 * @description Mock fetch ile tum guvenlik kontrollerini
 * ucdan uca calistirip rapor uretir. Uretimde CLI'nin
 * yaptigi islerin aynisini yapar. Tenant izolasyonu ve
 * PII kurallarina uyar.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { describe, it, expect } from "vitest";

import { runSecurityChecks, defaultFetch } from "../src/runner.js";
import { SECURITY_CHECKS } from "../src/config.js";
import { reportToMarkdown, reportToJson } from "../src/report.js";
import type { SecurityStep } from "../src/types.js";

const AUTH = { token: "T", tenantId: "A", branchId: "B1" };
const CROSS = { token: "T", tenantId: "B", branchId: "B2" };

function makeAcceptingFetch(): typeof defaultFetch {
  return async (method: SecurityStep["method"], url: string) => {
    if (url.includes("/auth/login"))
      return { status: 401, headers: {}, body: "{}" };
    if (url.includes("/auth/refresh"))
      return { status: 401, headers: {}, body: "{}" };
    if (url.includes("/clinic/examinations"))
      return { status: 403, headers: {}, body: "{}" };
    if (url.includes("/clinic/patients/pat-OTHER"))
      return { status: 404, headers: {}, body: "{}" };
    if (url.includes("/customer-balances/owners/own-OTHER"))
      return { status: 404, headers: {}, body: "{}" };
    if (url.includes("/soap-notes"))
      return { status: 422, headers: {}, body: "{}" };
    if (url.includes("/files/upload"))
      return { status: 400, headers: {}, body: "{}" };
    if (url.includes("/clinic/owners?limit=20"))
      return { status: 200, headers: {}, body: '{"items":[]}' };
    void method;
    return { status: 200, headers: {}, body: "{}" };
  };
}

describe("security-test smoke", () => {
  it("uctan uca rapor uretir", async () => {
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: makeAcceptingFetch(),
    });
    const md = reportToMarkdown(report);
    const json = reportToJson(report);
    expect(md).toContain("Guvenlik Testi Raporu");
    expect(md).toContain("Kontrol Sonuclari");
    expect(JSON.parse(json).allPassed).toBe(report.allPassed);
    expect(report.results.length).toBe(SECURITY_CHECKS.length);
  });
});
