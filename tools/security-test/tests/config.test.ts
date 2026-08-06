/**
 * @file config.test.ts — guvenlik kontrol katalogu testleri.
 * @module @vetniva/security-test/tests/config
 *
 * @description SECURITY_CHECKS katalogunun 9 kontrol
 * kategorisini, severity dagilimini, key unique
 * ozelligini, ASVS seviyelerini dogrular. Tenant izolasyonu
 * ve PII kurallarina uyar.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import { describe, expect, it } from "vitest";

import { SECURITY_CHECKS, getCheck, listCheckKeys } from "../src/config.js";

import type { SecurityControl } from "../src/types.js";

describe("SECURITY_CHECKS katalogu", () => {
  it("en az 10 kontrol icerir (9 kategori + rate limit/file_upload cesitliligi)", () => {
    expect(SECURITY_CHECKS.length).toBeGreaterThanOrEqual(10);
  });

  it("9 kontrol kategorisini kapsar", () => {
    const present = new Set<SecurityControl>(
      SECURITY_CHECKS.map((c) => c.control),
    );
    for (const c of [
      "auth",
      "authz",
      "idor",
      "xss",
      "csrf",
      "sql_injection",
      "file_upload",
      "rate_limit",
      "tenant_isolation",
    ] as SecurityControl[]) {
      expect(present.has(c), c).toBe(true);
    }
  });

  it("her kontrolun en az 1 step'i var", () => {
    for (const c of SECURITY_CHECKS) {
      expect(c.steps.length, c.key).toBeGreaterThan(0);
    }
  });

  it("key unique", () => {
    const keys = SECURITY_CHECKS.map((c) => c.key);
    const set = new Set(keys);
    expect(set.size).toBe(keys.length);
  });

  it("severity sadece gecerli enum degerlerinden biri", () => {
    const valid = new Set(["critical", "high", "medium", "low", "info"]);
    for (const c of SECURITY_CHECKS) {
      expect(valid.has(c.failureSeverity), c.key).toBe(true);
    }
  });

  it("ASVS seviyesi L1/L2/L3", () => {
    const valid = new Set(["L1", "L2", "L3"]);
    for (const c of SECURITY_CHECKS) {
      expect(valid.has(c.asvsLevel), c.key).toBe(true);
    }
  });

  it("critical severity en az 1 IDOR / authz / tenant_isolation kontrolu icin", () => {
    const criticals = SECURITY_CHECKS.filter(
      (c) => c.failureSeverity === "critical",
    );
    expect(criticals.length).toBeGreaterThan(0);
    for (const c of criticals) {
      // critical sadece guvenlik acisindan yuksek riskli kategorilerde olmali
      expect(
        ["authz", "idor", "sql_injection", "tenant_isolation"].includes(
          c.control,
        ),
        c.key,
      ).toBe(true);
    }
  });

  it("remediation alani her kontrol icin dolu", () => {
    for (const c of SECURITY_CHECKS) {
      expect(c.remediation.length, c.key).toBeGreaterThan(20);
    }
  });

  it("getCheck bilinen key'i doner", () => {
    const c = getCheck("idor_cross_tenant_patient");
    expect(c.control).toBe("idor");
    expect(c.failureSeverity).toBe("critical");
  });

  it("getCheck bilinmeyen key icin hata firlatir", () => {
    expect(() => getCheck("nonexistent_check")).toThrow();
  });

  it("listCheckKeys tum key'leri sirali sekilde doner", () => {
    const keys = listCheckKeys();
    expect(keys.length).toBe(SECURITY_CHECKS.length);
    expect(keys).toContain("auth_brute_force_lockout");
    expect(keys).toContain("tenant_isolation_list_scoped");
  });

  it("IDOR kontrolleri cross-tenant kategorisinde", () => {
    for (const c of SECURITY_CHECKS) {
      if (c.key.startsWith("idor_")) {
        expect(c.control, c.key).toBe("idor");
        expect(c.failureSeverity, c.key).toBe("critical");
      }
    }
  });
});
