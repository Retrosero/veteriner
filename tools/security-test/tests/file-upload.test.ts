/**
 * @file file-upload.test.ts — dosya yukleme kategori testleri.
 * @module @vetniva/security-test/tests/file-upload
 *
 * @description SECURITY_CHECKS icindeki file_upload (V12)
 * kategorisinin zararli dosya turu reddi, boyut limiti, MIME
 * dogrulamasi senaryolarini kapsadigini dogrular. .exe
 * uzantili / application/octet-stream MIME reddi, 100MB
 * dosya icin 413 Payload Too Large davranisi.
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

describe("file_upload kategorisi: V12 kontrolleri", () => {
  const fileChecks = SECURITY_CHECKS.filter((c) => c.control === "file_upload");

  it("en az 2 file_upload kontrolu var (MIME + size)", () => {
    expect(fileChecks.length).toBeGreaterThanOrEqual(2);
  });

  it("MIME validation L2 + high severity", () => {
    const check = fileChecks.find(
      (c) => c.key === "file_upload_mime_validation",
    );
    expect(check).toBeDefined();
    expect(check?.asvsLevel).toBe("L2");
    expect(check?.failureSeverity).toBe("high");
  });

  it(".exe upload reddi 400/415/422 bekler", () => {
    const check = SECURITY_CHECKS.find(
      (c) => c.key === "file_upload_mime_validation",
    );
    expect(check?.steps[0]?.expectStatus).toEqual([400, 415, 422]);
  });

  it("Size limit L2 + medium severity", () => {
    const check = fileChecks.find((c) => c.key === "file_upload_size_limit");
    expect(check).toBeDefined();
    expect(check?.asvsLevel).toBe("L2");
    expect(check?.failureSeverity).toBe("medium");
  });

  it("100MB upload 413/422 bekler", () => {
    const check = SECURITY_CHECKS.find(
      (c) => c.key === "file_upload_size_limit",
    );
    expect(check?.steps[0]?.expectStatus).toEqual([413, 422]);
  });
});

describe("runner: file_upload davranisi", () => {
  it(".exe upload 400/415 donerse PASS", async () => {
    const fetch = makeFetch((req) => {
      if (req.url.includes("/files/upload")) {
        const body = req.body as { size?: number; name?: string };
        if (body?.size && body.size > 10485760) {
          return { status: 413, body: "{}" };
        }
        if (body?.name?.endsWith(".exe")) {
          return { status: 415, body: "{}" };
        }
        return { status: 400, body: "{}" };
      }
      return { status: 200, body: "{}" };
    });
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter((c) => c.control === "file_upload"),
    });
    for (const r of report.results) {
      expect(r.status, r.check).toBe("pass");
    }
  });

  it(".exe upload 200 donerse FAIL (kabul edildi - guvenlik acigi)", async () => {
    const fetch = makeFetch(() => ({ status: 200, body: "{}" }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter(
        (c) => c.key === "file_upload_mime_validation",
      ),
    });
    expect(report.results[0]?.status).toBe("fail");
    expect(report.results[0]?.severity).toBe("high");
  });

  it("100MB upload 200 donerse FAIL (boyut siniri yok)", async () => {
    const fetch = makeFetch(() => ({ status: 200, body: "{}" }));
    const report = await runSecurityChecks({
      baseUrl: "http://localhost:3001",
      auth: AUTH,
      crossTenantAuth: CROSS,
      fetchFn: fetch,
      checks: SECURITY_CHECKS.filter((c) => c.key === "file_upload_size_limit"),
    });
    expect(report.results[0]?.status).toBe("fail");
  });
});
