/**
 * @file auth-roles.test.ts — auth/authz kategori testleri.
 * @module @vetniva/security-test/tests/auth-roles
 *
 * @description SECURITY_CHECKS icindeki auth (V2) ve authz
 * (V4) kategorilerinin asagidaki senaryolari kapsadigini
 * dogrular:
 *   - audit:log:read permission kontrolu
 *   - Role degisikligi audit trail (authz_role_escalation)
 *   - Brute-force / expired token / refresh token rotation
 *   - STAFF -> VETERINARIAN escalation 403
 *
 * Her test SECURITY_CHECKS uzerinde dogrulama yapar; tenant
 * izolasyonu, PII ve audit kurallarina uyar.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { describe, expect, it } from "vitest";

import { SECURITY_CHECKS } from "../src/config.js";
import { buildAuthHeaders, runSecurityChecks } from "../src/runner.js";

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
const CROSS: SecurityAuthContext = {
  token: "CROSS_TOKEN",
  tenantId: "tnt-pilot-b",
  branchId: "brc-pilot-b-1",
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

describe("auth kategorisi: V2 kontrolleri", () => {
  const authChecks = SECURITY_CHECKS.filter((c) => c.control === "auth");

  it("auth kategorisinde en az 3 kontrol var", () => {
    expect(authChecks.length).toBeGreaterThanOrEqual(3);
  });

  it("brute-force lockout kontrolu 401/423 bekler", () => {
    const check = authChecks.find((c) => c.key === "auth_brute_force_lockout");
    expect(check).toBeDefined();
    expect(check?.asvsLevel).toBe("L2");
    // Lockout senaryosu: 5. deneme 401, 6. deneme 401/423/429 olmali.
    const step6 = check?.steps.find((s) => s.name === "6_deneme_locked");
    expect(step6?.expectStatus).toEqual([401, 423, 429]);
  });

  it("expired token kontrolu 401 bekler", () => {
    const check = authChecks.find((c) => c.key === "auth_expired_token");
    expect(check).toBeDefined();
    expect(check?.steps[0]?.expectStatus).toEqual([401]);
  });

  it("refresh token rotation kontrolu var", () => {
    const check = authChecks.find(
      (c) => c.key === "auth_refresh_token_rotation",
    );
    expect(check).toBeDefined();
    // 200 (basarili) veya 401 (invalid) kabul edilebilir.
    expect(check?.steps[0]?.expectStatus).toEqual([200, 401]);
  });
});

describe("authz kategorisi: rol escalation + audit log", () => {
  const authzChecks = SECURITY_CHECKS.filter((c) => c.control === "authz");

  it("en az 1 authz kontrolu var", () => {
    expect(authzChecks.length).toBeGreaterThanOrEqual(1);
  });

  it("rol escalation 403 bekler (STAFF -> VETERINARIAN)", () => {
    const check = authzChecks.find((c) => c.key === "authz_role_escalation");
    expect(check).toBeDefined();
    expect(check?.failureSeverity).toBe("critical");
    expect(check?.asvsLevel).toBe("L1");
    expect(check?.steps[0]?.expectStatus).toEqual([403]);
  });

  it("remediation alani icerikte permission:write gecir", () => {
    const check = authzChecks.find((c) => c.key === "authz_role_escalation");
    expect(check?.remediation.toLowerCase()).toContain("permission");
  });
});

describe("runner: auth+authz uctan uca", () => {
  it("401 donduren auth endpoint'leri PASS uretir", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/auth/login")) return { status: 401, body: "{}" };
      if (req.url.includes("/auth/refresh")) return { status: 401, body: "{}" };
      if (req.url.includes("/clinic/examinations"))
        return { status: 403, body: "{}" };
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
    });
    const authzRole = report.results.find(
      (r) => r.check === "authz_role_escalation",
    );
    expect(authzRole?.status).toBe("pass");

    const bruteForce = report.results.find(
      (r) => r.check === "auth_brute_force_lockout",
    );
    // 5. ve 6. deneme mock'ta hep 401; expectStatus icinde 401 var -> pass.
    expect(bruteForce?.status).toBe("pass");
  });

  it("buildAuthHeaders Bearer + tenant header uretir", () => {
    const h = buildAuthHeaders(AUTH);
    expect(h["Authorization"]).toBe("Bearer TEST_TOKEN");
    expect(h["X-Tenant-Id"]).toBe("tnt-pilot-a");
    expect(h["X-Branch-Id"]).toBe("brc-pilot-a-1");
  });
});
