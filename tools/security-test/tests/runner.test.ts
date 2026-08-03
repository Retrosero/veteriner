/**
 * @file runner.test.ts — guvenlik testi runner testleri.
 * @module @vetniva/security-test/tests/runner
 *
 * @description runSecurityChecks'in mock fetch ile PASS/FAIL/SKIP
 * sonuclarini dogru urettigini; cross-tenant auth olmadan
 * IDOR/tenant_isolation kontrollerinin skip urettigini;
 * status, body regex, header yasaklari kontrollerini dogrular.
 * Tenant izolasyonu ve PII kurallarina uyar.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { describe, it, expect } from "vitest";

import { runSecurityChecks, buildAuthHeaders } from "../src/runner.js";
import { SECURITY_CHECKS } from "../src/config.js";
import type {
  SecurityAuthContext,
  SecurityFetch,
  SecurityStep,
} from "../src/types.js";

const AUTH: SecurityAuthContext = {
  token: "TEST_TOKEN",
  tenantId: "tnt-pilot-a",
  branchId: "brc-pilot-a-1",
};

const CROSS_AUTH: SecurityAuthContext = {
  token: "TEST_TOKEN",
  tenantId: "tnt-pilot-b",
  branchId: "brc-pilot-b-1",
};

function makeFetch(
  responder: (req: { method: string; url: string; body: unknown }) => {
    status: number;
    headers?: Record<string, string>;
    body: string;
  },
): SecurityFetch {
  return async (
    method: SecurityStep["method"],
    url: string,
    init: { body?: unknown },
  ) => {
    const r = responder({ method, url, body: init.body });
    return {
      status: r.status,
      headers: r.headers ?? {},
      body: r.body,
    };
  };
}

describe("buildAuthHeaders", () => {
  it("Bearer + X-Tenant-Id + X-Branch-Id header'larini uretir", () => {
    const h = buildAuthHeaders(AUTH);
    expect(h["Authorization"]).toBe("Bearer TEST_TOKEN");
    expect(h["X-Tenant-Id"]).toBe("tnt-pilot-a");
    expect(h["X-Branch-Id"]).toBe("brc-pilot-a-1");
  });

  it("extra header'lar merge edilir", () => {
    const h = buildAuthHeaders(AUTH, { "X-Trace-Id": "trace-1" });
    expect(h["X-Trace-Id"]).toBe("trace-1");
  });
});

describe("runSecurityChecks", () => {
  it("cross-tenant auth olmadan IDOR/tenant_isolation kontrolleri skip uretir", async () => {
    const fetch = makeFetch(() => ({ status: 200, body: "{}" }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      // crossTenantAuth yok
      fetchFn: fetch,
    });
    const idorResults = report.results.filter(
      (r) =>
        r.check.startsWith("idor_") ||
        r.check === "tenant_isolation_list_scoped",
    );
    expect(idorResults.length).toBeGreaterThan(0);
    for (const r of idorResults) {
      expect(r.status, r.check).toBe("skip");
    }
  });

  it("beklenen status donen kontroller PASS uretir", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/auth/login")) return { status: 401, body: "{}" };
      if (req.url.includes("/auth/refresh")) return { status: 401, body: "{}" };
      if (req.url.includes("/clinic/examinations/exm-staff-test/sign"))
        return { status: 403, body: "{}" };
      if (req.url.includes("/clinic/patients/pat-OTHER"))
        return { status: 404, body: "{}" };
      if (req.url.includes("/customer-balances/owners/own-OTHER"))
        return { status: 404, body: "{}" };
      if (req.url.includes("/soap-notes")) return { status: 422, body: "{}" };
      if (
        req.url.includes("/files/upload") &&
        req.body &&
        (req.body as { size?: number }).size &&
        (req.body as { size?: number }).size! > 10485760
      )
        return { status: 413, body: "{}" };
      if (req.url.includes("/files/upload")) return { status: 400, body: "{}" };
      if (req.url.includes("/api/v1/clinic/owners?limit=20"))
        return { status: 200, body: '{"items":[]}' };
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS_AUTH,
      fetchFn: fetch,
    });
    // auth/refresh 401; staff escalation 403; cross-tenant 404
    const byCheck = new Map(report.results.map((r) => [r.check, r]));
    const checks = [
      "auth_brute_force_lockout",
      "auth_refresh_token_rotation",
      "authz_role_escalation",
      "idor_cross_tenant_patient",
      "idor_cross_tenant_owner",
      "xss_input_sanitization",
      "xss_output_encoding",
      "file_upload_mime_validation",
      "file_upload_size_limit",
      "rate_limit_per_user_token_bucket",
      "tenant_isolation_list_scoped",
    ];
    for (const k of checks) {
      const r = byCheck.get(k);
      expect(r, k).toBeDefined();
      expect(r?.status, k).toBe("pass");
    }
  });

  it("beklenen status gelmediginde FAIL uretir", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/auth/login")) return { status: 200, body: "{}" };
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS_AUTH,
      fetchFn: fetch,
      // Sadece brute force kontrolu
      checks: SECURITY_CHECKS.filter(
        (c) => c.key === "auth_brute_force_lockout",
      ),
    });
    expect(report.results[0]?.status).toBe("fail");
    expect(report.failCount).toBe(1);
    expect(report.allPassed).toBe(false);
  });

  it("body regex yasagi yakalanirsa FAIL uretir", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/soap-notes")) {
        return {
          status: 201,
          body: JSON.stringify({ subjective: "<script>alert(1)</script>" }),
        };
      }
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter((c) => c.key === "xss_input_sanitization"),
    });
    expect(report.results[0]?.status).toBe("fail");
  });

  it("skipByDefault olan kontroller default olarak skip uretir", async () => {
    const fetch = makeFetch(() => ({ status: 200, body: "{}" }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS_AUTH,
      fetchFn: fetch,
    });
    const csrf = report.results.find(
      (r) => r.check === "csrf_state_changing_token",
    );
    expect(csrf?.status).toBe("skip");
  });

  it("includeSkipped ile skipByDefault kontrolleri calistirilir", async () => {
    const fetch = makeFetch(() => ({ status: 403, body: "{}" }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS_AUTH,
      fetchFn: fetch,
      includeSkipped: true,
    });
    const csrf = report.results.find(
      (r) => r.check === "csrf_state_changing_token",
    );
    expect(csrf?.status).toBe("pass");
  });

  it("genel rapor: passCount/failCount/skipCount toplami = results.length", async () => {
    const fetch = makeFetch(() => ({ status: 200, body: "{}" }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS_AUTH,
      fetchFn: fetch,
    });
    expect(report.passCount + report.failCount + report.skipCount).toBe(
      report.results.length,
    );
  });

  it("bySeverity kritik FAIL sayisini dogru sayar", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/auth/login")) return { status: 200, body: "{}" }; // FAIL
      if (req.url.includes("/customer-balances/owners/own-OTHER"))
        return { status: 200, body: "{}" }; // FAIL (expected 404)
      if (req.url.includes("/clinic/examinations"))
        return { status: 200, body: "{}" }; // FAIL (expected 403)
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS_AUTH,
      fetchFn: fetch,
    });
    expect(report.bySeverity.critical).toBeGreaterThan(0);
  });
});
