/**
 * @file xss-csrf.test.ts — XSS + CSRF kategori testleri.
 * @module @vetniva/security-test/tests/xss-csrf
 *
 * @description SECURITY_CHECKS icindeki xss (V5) ve csrf
 * kategorilerinin XSS payload input sanitization, output
 * encoding, CSRF token kontrolu senaryolarini kapsadigini
 * dogrular. Runner ile API call sonrasi response body
 * regex yasaklari, expected status dogrulamasi yapar.
 *
 * Tenant izolasyonu, PII ve audit kurallarina uyar.
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

describe("XSS kategorisi: V5 kontrolleri", () => {
  const xssChecks = SECURITY_CHECKS.filter((c) => c.control === "xss");

  it("en az 2 XSS kontrolu var (input + output)", () => {
    expect(xssChecks.length).toBeGreaterThanOrEqual(2);
  });

  it("XSS input sanitization 422 bekler (Zod validation)", () => {
    const check = xssChecks.find((c) => c.key === "xss_input_sanitization");
    expect(check).toBeDefined();
    // 201 (kabul), 400, 422; gercek davranis schema'ya bagli.
    expect(check?.steps[0]?.expectStatus).toEqual([201, 400, 422]);
  });

  it("XSS input body regex yasagi <script>alert icin", () => {
    const check = xssChecks.find((c) => c.key === "xss_input_sanitization");
    const patterns = check?.steps[0]?.forbidBodyRegex ?? [];
    expect(patterns.some((p) => p.includes("script"))).toBe(true);
  });

  it("XSS output encoding <img onerror yasagi", () => {
    const check = xssChecks.find((c) => c.key === "xss_output_encoding");
    const patterns = check?.steps[0]?.forbidBodyRegex ?? [];
    expect(patterns.some((p) => p.includes("img"))).toBe(true);
  });

  it("XSS kontrolleri L1 + high/low severity", () => {
    for (const c of xssChecks) {
      expect(c.asvsLevel, c.key).toBe("L1");
      expect(["high", "low"]).toContain(c.failureSeverity);
    }
  });
});

describe("CSRF kategorisi: state-changing token", () => {
  const csrfChecks = SECURITY_CHECKS.filter((c) => c.control === "csrf");

  it("en az 1 CSRF kontrolu var", () => {
    expect(csrfChecks.length).toBeGreaterThanOrEqual(1);
  });

  it("CSRF kontrolu L2 + medium severity", () => {
    const check = csrfChecks.find((c) => c.key === "csrf_state_changing_token");
    expect(check?.asvsLevel).toBe("L2");
    expect(check?.failureSeverity).toBe("medium");
  });

  it("CSRF skipByDefault (bearer-only auth)", () => {
    const check = csrfChecks.find((c) => c.key === "csrf_state_changing_token");
    expect(check?.skipByDefault).toBe(true);
  });

  it("CSRF kontrol Origin header ile cross-origin 403 bekler", () => {
    const check = csrfChecks.find((c) => c.key === "csrf_state_changing_token");
    const step = check?.steps[0];
    expect(step?.expectStatus).toEqual([403, 422]);
    expect(step?.headers?.["Origin"]).toBeDefined();
  });
});

describe("runner: xss + csrf davranisi", () => {
  it("XSS payload response body'de yasakli regex varsa FAIL", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/soap-notes")) {
        return {
          status: 201,
          body: JSON.stringify({
            subjective: "<script>alert(1)</script>",
          }),
        };
      }
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter((c) => c.key === "xss_input_sanitization"),
    });
    expect(report.results[0]?.status).toBe("fail");
  });

  it("XSS payload temiz response PASS uretir", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/soap-notes"))
        return { status: 422, body: '{"error":"validation failed"}' };
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter((c) => c.key === "xss_input_sanitization"),
    });
    expect(report.results[0]?.status).toBe("pass");
  });

  it("CSRF skipByDefault: includeSkipped olmadan skip", async () => {
    const fetch = makeFetch(() => ({ status: 403, body: "{}" }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
    });
    const csrf = report.results.find(
      (r) => r.check === "csrf_state_changing_token",
    );
    expect(csrf?.status).toBe("skip");
  });

  it("CSRF includeSkipped ile calistirilirsa expected status'a gore PASS", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/clinic/owners"))
        return { status: 403, body: "{}" };
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      includeSkipped: true,
    });
    const csrf = report.results.find(
      (r) => r.check === "csrf_state_changing_token",
    );
    expect(csrf?.status).toBe("pass");
  });
});
