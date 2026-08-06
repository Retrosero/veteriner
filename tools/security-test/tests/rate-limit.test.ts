/**
 * @file rate-limit.test.ts — rate limit kategori testleri.
 * @module @vetniva/security-test/tests/rate-limit
 *
 * @description SECURITY_CHECKS icindeki rate_limit (V11)
 * kategorisinin per-user token bucket, burst login attempts
 * 429 davranisi senaryolarini kapsadigini dogrular.
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

describe("rate_limit kategorisi: V11 kontrolleri", () => {
  const rlChecks = SECURITY_CHECKS.filter((c) => c.control === "rate_limit");

  it("en az 1 rate_limit kontrolu var", () => {
    expect(rlChecks.length).toBeGreaterThanOrEqual(1);
  });

  it("rate_limit L2 + medium severity", () => {
    const check = rlChecks.find(
      (c) => c.key === "rate_limit_per_user_token_bucket",
    );
    expect(check).toBeDefined();
    expect(check?.asvsLevel).toBe("L2");
    expect(check?.failureSeverity).toBe("medium");
  });

  it("Burst login 401/429 bekler (limitasyon asimi 429)", () => {
    const check = SECURITY_CHECKS.find(
      (c) => c.key === "rate_limit_per_user_token_bucket",
    );
    expect(check?.steps[0]?.expectStatus).toEqual([401, 429]);
  });
});

describe("runner: rate_limit davranisi", () => {
  it("Burst login 429 donerse PASS", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/auth/login"))
        return { status: 429, body: '{"error":"rate_limited"}' };
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter(
        (c) => c.key === "rate_limit_per_user_token_bucket",
      ),
    });
    expect(report.results[0]?.status).toBe("pass");
  });

  it("Burst login 200 donerse FAIL (limitasyon yok)", async () => {
    const fetch = makeFetch(() => ({ status: 200, body: "{}" }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter(
        (c) => c.key === "rate_limit_per_user_token_bucket",
      ),
    });
    expect(report.results[0]?.status).toBe("fail");
  });

  it("Burst login 401 donerse PASS (auth fail + limitasyon aktif)", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/auth/login")) return { status: 401, body: "{}" };
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter(
        (c) => c.key === "rate_limit_per_user_token_bucket",
      ),
    });
    expect(report.results[0]?.status).toBe("pass");
  });
});
