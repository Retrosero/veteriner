/**
 * @file tenant-isolation.test.ts — tenant izolasyonu + IDOR testleri.
 * @module @vetniva/security-test/tests/tenant-isolation
 *
 * @description SECURITY_CHECKS icindeki idor ve tenant_isolation
 * kategorilerinin cross-tenant IDOR, X-Tenant-Id header
 * dogrulamasi, 403/404 davranis senaryolarini kapsadigini
 * dogrular. Runner ile cross-tenant auth kullanildiginda
 * dogru PASS/FAIL urettigini dogrular.
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
  token: "TOKEN_A",
  tenantId: "tnt-a",
  branchId: "brc-a-1",
};
const CROSS: SecurityAuthContext = {
  token: "TOKEN_B",
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

describe("IDOR kategorisi: cross-tenant senaryolari", () => {
  const idorChecks = SECURITY_CHECKS.filter((c) => c.control === "idor");

  it("en az 2 IDOR kontrolu var (patient + owner)", () => {
    expect(idorChecks.length).toBeGreaterThanOrEqual(2);
  });

  it("Tum IDOR kontrolleri critical severity", () => {
    for (const c of idorChecks) {
      expect(c.failureSeverity, c.key).toBe("critical");
    }
  });

  it("Cross-tenant patient timeline 404 bekler (gizli 404)", () => {
    const check = idorChecks.find((c) => c.key === "idor_cross_tenant_patient");
    expect(check).toBeDefined();
    expect(check?.steps[0]?.expectStatus).toEqual([404]);
  });

  it("Cross-tenant owner balance 404 bekler", () => {
    const check = idorChecks.find((c) => c.key === "idor_cross_tenant_owner");
    expect(check).toBeDefined();
    expect(check?.steps[0]?.expectStatus).toEqual([404]);
  });
});

describe("tenant_isolation kategorisi: list scoping", () => {
  const tiChecks = SECURITY_CHECKS.filter(
    (c) => c.control === "tenant_isolation",
  );

  it("en az 1 tenant_isolation kontrolu var", () => {
    expect(tiChecks.length).toBeGreaterThanOrEqual(1);
  });

  it("List scoping L1 + critical", () => {
    const check = tiChecks.find(
      (c) => c.key === "tenant_isolation_list_scoped",
    );
    expect(check?.asvsLevel).toBe("L1");
    expect(check?.failureSeverity).toBe("critical");
  });

  it("List response cross-tenant marker icermemeli (forbidBodyRegex)", () => {
    const check = tiChecks.find(
      (c) => c.key === "tenant_isolation_list_scoped",
    );
    expect(check?.steps[0]?.forbidBodyRegex).toBeDefined();
    const patterns = check?.steps[0]?.forbidBodyRegex ?? [];
    expect(patterns.length).toBeGreaterThan(0);
  });
});

describe("runner: IDOR + tenant_isolation davranisi", () => {
  it("cross-tenant auth yoksa IDOR/tenant_isolation skip uretir", async () => {
    const fetch = makeFetch(() => ({ status: 200, body: "{}" }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      // crossTenantAuth yok
      fetchFn: fetch,
    });
    const skip = report.results.filter(
      (r) =>
        r.check.startsWith("idor_") ||
        r.check === "tenant_isolation_list_scoped",
    );
    expect(skip.length).toBeGreaterThan(0);
    for (const r of skip) {
      expect(r.status, r.check).toBe("skip");
    }
  });

  it("cross-tenant auth ile 404 donerse PASS, 200 donerse FAIL", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/clinic/patients/pat-OTHER"))
        return { status: 404, body: "{}" };
      if (req.url.includes("/customer-balances/owners/own-OTHER"))
        return { status: 404, body: "{}" };
      if (req.url.includes("/clinic/owners?limit=20"))
        return { status: 200, body: '{"items":[]}' };
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
    });

    const idorPatient = report.results.find(
      (r) => r.check === "idor_cross_tenant_patient",
    );
    const idorOwner = report.results.find(
      (r) => r.check === "idor_cross_tenant_owner",
    );
    expect(idorPatient?.status).toBe("pass");
    expect(idorOwner?.status).toBe("pass");
  });

  it("cross-tenant 200 donerse FAIL (bilgi sizintisi)", async () => {
    const fetch = makeFetch(() => ({ status: 200, body: '{"data":"leaked"}' }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
    });
    const idor = report.results.find(
      (r) => r.check === "idor_cross_tenant_patient",
    );
    expect(idor?.status).toBe("fail");
    expect(idor?.severity).toBe("critical");
  });
});
