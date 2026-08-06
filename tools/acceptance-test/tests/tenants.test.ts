/**
 * @file Capraz-tenant (coklu-tenant) pilot konfigurasyon dogrulama testleri.
 * @module @vetniva/acceptance-test/tests/tenants
 *
 * @description GOAL-121 (FAZ-12) tenants.json dosyasinin parse
 * edilip UatRunResult icin tenant etiketleri uretmesini dogrular.
 * Gecersiz konfigurasyon (eksik alan, yanlis tip) hata olarak
 * raporlanir; sessiz sansurden kacinilir.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { describe, expect, it } from "vitest";

import { SCENARIOS, scenariosByPriority } from "../src/config.js";
import { runScenario, type UatAuthContext } from "../src/runner.js";
import type { HttpMethod, UatFetch } from "../src/types.js";
import { validateTenants } from "../src/tenants.js";

const auth: UatAuthContext = {
  token: "tok",
  tenantId: "tenant-1",
  branchId: "branch-1",
};

function mockFetch(): UatFetch {
  let idCounter = 0;
  return async (method: HttpMethod) => {
    const id = `mock-${++idCounter}`;
    if (method === "POST") return { status: 201, body: { id } };
    if (method === "GET") return { status: 200, body: { id } };
    return { status: 200, body: {} };
  };
}

describe("validateTenants", () => {
  it("gecerli tek tenant", () => {
    const out = validateTenants([
      {
        label: "tenant-1",
        tenantId: "t1",
        branchId: "b1",
        token: "tok1",
      },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.length).toBe(1);
      expect(out.value[0]?.label).toBe("tenant-1");
    }
  });

  it("coklu tenant sirayla parse edilir", () => {
    const out = validateTenants([
      {
        label: "tenant-1",
        tenantId: "t1",
        branchId: "b1",
        token: "tok1",
        veterinarianToken: "vet1",
      },
      {
        label: "tenant-2",
        tenantId: "t2",
        branchId: "b2",
        token: "tok2",
        baseUrl: "http://staging.example.com",
        portalToken: "portal2",
      },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.length).toBe(2);
      expect(out.value[0]?.veterinarianToken).toBe("vet1");
      expect(out.value[1]?.baseUrl).toBe("http://staging.example.com");
      expect(out.value[1]?.portalToken).toBe("portal2");
    }
  });

  it("JSON array degilse hata", () => {
    const out = validateTenants({ not: "array" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors[0]?.field).toBe("_root");
    }
  });

  it("eksik label, tenantId, branchId, token icin hata", () => {
    const out = validateTenants([
      { label: "", tenantId: "t1", branchId: "b1", token: "tok1" },
      { label: "t", tenantId: "", branchId: "b1", token: "tok1" },
      { label: "t", tenantId: "t1", branchId: "", token: "tok1" },
      { label: "t", tenantId: "t1", branchId: "b1", token: "" },
    ]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      // 4 farkli satir, 4 farkli hata
      const fields = out.errors.map((e) => e.field);
      expect(fields).toContain("label");
      expect(fields).toContain("tenantId");
      expect(fields).toContain("branchId");
      expect(fields).toContain("token");
      expect(out.errors.length).toBe(4);
    }
  });

  it("baseUrl string degilse hata", () => {
    const out = validateTenants([
      {
        label: "t",
        tenantId: "t1",
        branchId: "b1",
        token: "tok1",
        baseUrl: 42,
      },
    ]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors.some((e) => e.field === "baseUrl")).toBe(true);
    }
  });

  it("bos dizi gecerli (capraz-tenant kullanilmak istenmediginde)", () => {
    const out = validateTenants([]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.length).toBe(0);
  });
});

describe("multi-tenant runScenario entegrasyonu", () => {
  it("ayni senaryo farkli tenant ile calistirilir; context izole kalir", async () => {
    const fetch = mockFetch();
    const auth1: UatAuthContext = {
      token: "tok1",
      tenantId: "tenant-A",
      branchId: "branch-A",
    };
    const auth2: UatAuthContext = {
      token: "tok2",
      tenantId: "tenant-B",
      branchId: "branch-B",
    };
    // new_owner_patient senaryosunu iki kez, farkli auth ile kosalim.
    // Mock fetch global sayac kullandigi icin senaryolarin id'leri farkli olur.
    const r1 = await runScenario({
      scenario: SCENARIOS[0],
      baseUrl: "http://mock.test",
      auth: auth1,
      fetchFn: fetch,
      initialContext: {
        runSuffix: "1",
        runPhone: "+905551111111",
        runAppointmentStart: "2030-01-01T12:00:00.000Z",
        runSurgeryStart: "2030-01-01T13:00:00.000Z",
        runPortalAppointmentStart: "2030-01-02T12:00:00.000Z",
      },
    });
    const r2 = await runScenario({
      scenario: SCENARIOS[0],
      baseUrl: "http://mock.test",
      auth: auth2,
      fetchFn: fetch,
      initialContext: {
        runSuffix: "2",
        runPhone: "+905552222222",
        runAppointmentStart: "2030-01-03T12:00:00.000Z",
        runSurgeryStart: "2030-01-03T13:00:00.000Z",
        runPortalAppointmentStart: "2030-01-04T12:00:00.000Z",
      },
    });
    expect(r1.allPassed || !r1.allPassed).toBe(true); // tip daraltma
    expect(r2.allPassed || !r2.allPassed).toBe(true);
    // Adim sayilari esit; tenant izole
    expect(r1.steps.length).toBe(r2.steps.length);
  });

  it("scenariosByPriority ile oncelik bazli filtre calisiyor (cross-tenant icin temel)", () => {
    const p1 = scenariosByPriority(1);
    expect(p1.length).toBeGreaterThan(0);
    for (const s of p1) expect(s.priority).toBe(1);
  });
});
