/**
 * @file sql-injection.test.ts — SQL injection kategori testleri.
 * @module @vetniva/security-test/tests/sql-injection
 *
 * @description SECURITY_CHECKS icindeki sql_injection (V5)
 * kategorisinin parametreli sorgu + ORM injection
 * senaryolarini kapsadigini dogrular. UNION ve DROP TABLE
 * payloadlari icin 500 donmedigini, response body'de SQL
 * hata mesaji (syntax error / ORA- / PG::SyntaxError)
 * gecmedigini dogrular. Tenant izolasyonu, PII ve audit
 * kurallarina uyar.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { describe, expect, it } from "vitest";

import { SECURITY_CHECKS } from "../src/config.js";
import { runSecurityChecks } from "../src/runner.js";

import type {
  SecurityAuthContext,
  SecurityFetch,
  SecurityStep,
} from "../src/types.js";

const AUTH: SecurityAuthContext = {
  token: "TOKEN",
  tenantId: "tnt-a",
  branchId: "brc-a-1",
};
const CROSS: SecurityAuthContext = {
  token: "CROSS",
  tenantId: "tnt-b",
  branchId: "brc-b-1",
};

function makeFetch(
  handler: (req: { method: string; url: string; body?: unknown }) => {
    status: number;
    body: string;
  },
): SecurityFetch {
  return async (
    method: SecurityStep["method"],
    url: string,
    init: { body?: unknown },
  ) => ({
    status: handler({ method, url, body: init.body }).status,
    headers: {},
    body: handler({ method, url, body: init.body }).body,
  });
}

describe("sql_injection kategorisi: V5.3/V5.4 kontrolleri", () => {
  const sqlChecks = SECURITY_CHECKS.filter(
    (c) => c.control === "sql_injection",
  );

  it("en az 1 SQL injection kontrolu var", () => {
    expect(sqlChecks.length).toBeGreaterThanOrEqual(1);
  });

  it("SQL injection kontrolu L1 + critical severity", () => {
    const check = sqlChecks.find((c) => c.key === "sql_injection_search");
    expect(check?.asvsLevel).toBe("L1");
    expect(check?.failureSeverity).toBe("critical");
  });

  it("UNION payload step var", () => {
    const check = SECURITY_CHECKS.find((c) => c.key === "sql_injection_search");
    const step = check?.steps.find((s) => s.name === "sqli_union");
    expect(step).toBeDefined();
    expect(step?.path).toContain("' OR '1'='1");
  });

  it("DROP TABLE payload step var", () => {
    const check = SECURITY_CHECKS.find((c) => c.key === "sql_injection_search");
    const step = check?.steps.find((s) => s.name === "sqli_drop");
    expect(step).toBeDefined();
    expect(step?.path).toContain("DROP TABLE");
  });

  it("forbidBodyRegex SQL hata patternlerini icerir", () => {
    const check = SECURITY_CHECKS.find((c) => c.key === "sql_injection_search");
    const all = check?.steps.flatMap((s) => s.forbidBodyRegex ?? []) ?? [];
    expect(all).toContain("syntax error");
    expect(all).toContain("ORA-");
    expect(all).toContain("PG::SyntaxError");
  });
});

describe("runner: SQL injection davranisi", () => {
  it("Temiz 200 response PASS uretir (parametreli sorgu kaniti)", async () => {
    const fetch = makeFetch(() => ({ status: 200, body: '{"items":[]}' }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter((c) => c.key === "sql_injection_search"),
    });
    expect(report.results[0]?.status).toBe("pass");
  });

  it("500 donerse FAIL (sorgu patladi)", async () => {
    const fetch = makeFetch(() => ({
      status: 500,
      body: "Internal Server Error",
    }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter((c) => c.key === "sql_injection_search"),
    });
    expect(report.results[0]?.status).toBe("fail");
  });

  it("Response body'de SQL hata mesaji varsa FAIL", async () => {
    const fetch = makeFetch(() => ({
      status: 200,
      body: 'PG::SyntaxError: syntax error at or near "OR"',
    }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter((c) => c.key === "sql_injection_search"),
    });
    expect(report.results[0]?.status).toBe("fail");
  });
});
