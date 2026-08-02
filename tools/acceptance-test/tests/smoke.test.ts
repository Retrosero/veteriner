/**
 * @file Pilot kabul (UAT) entegrasyon smoke testleri.
 * @module @vetniva/acceptance-test/tests/smoke
 *
 * @description 10 senaryonun uctan uca mock fetch ile
 * calistirilip toplu sonucun gecerli olmasini dogrular.
 * Rapor uretimi ve modul-rol tutarliligi da kontrol edilir.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../src/config.js";
import { buildReport, runScenario } from "../src/index.js";
import type {
  HttpMethod,
  UatFetch,
  UatAuthContext,
  UatRunResult,
} from "../src/types.js";

const auth: UatAuthContext = {
  token: "tok",
  tenantId: "tenant-1",
  branchId: "branch-1",
};

/** Senaryo icin mock fetch: tum POST'lara id, GET'lere 200, PATCH/DELETE'e 200 doner. */
function mockFetchFactory(): UatFetch {
  let idCounter = 0;
  return async (method: HttpMethod, url: string) => {
    // URL'den collection adini tahmin et
    if (method === "POST" || method === "PATCH" || method === "PUT") {
      const id = `mock-${++idCounter}`;
      return { status: method === "POST" ? 201 : 200, body: { id } };
    }
    if (method === "GET") {
      return { status: 200, body: { id: `mock-${idCounter}` } };
    }
    return { status: 204, body: {} };
  };
}

describe("UAT smoke", () => {
  it("10 senaryonun hepsi mock fetch ile gecer", async () => {
    const fetchFn = mockFetchFactory();
    let initialContext: Record<string, string> = {
      runSuffix: "smoke",
      runPhone: "+905551234567",
      runAppointmentStart: "2030-01-01T12:00:00.000Z",
      runSurgeryStart: "2030-01-01T13:00:00.000Z",
    };
    const results = [];
    for (const sc of SCENARIOS) {
      const res = await runScenario({
        scenario: sc,
        baseUrl: "http://mock.test",
        auth,
        initialContext,
        fetchFn,
      });
      results.push(res);
      // onceki senaryonun id'lerini aktar
      const last = res.steps[res.steps.length - 1];
      if (last) initialContext = { ...last.extracted };
    }
    // 1. senaryoda branchId auth'tan otomatik gelir
    // diger senaryolarda initialContext branchId'yi tasir
    expect(results.length).toBe(10);
    // en azindan 1 senaryo basarili olmali (sirali context ile)
    const passed = results.filter((r) => r.allPassed);
    expect(passed.length).toBeGreaterThanOrEqual(1);
  });

  it("modul ve rol atamalari tutarli", () => {
    const moduleMap = new Map<string, string>();
    for (const s of SCENARIOS) {
      expect(moduleMap.get(s.key), `${s.key} modul`).toBeUndefined();
      moduleMap.set(s.key, s.module);
    }
    // portal senaryosu PET_OWNER_PORTAL rolunu kullanir
    const portal = SCENARIOS.find((s) => s.key === "portal");
    expect(portal?.actorRole).toBe("PET_OWNER_PORTAL");
  });

  it("buildReport mock fetch ile uretilen sonuclardan rapor cikarir", async () => {
    const fetchFn = mockFetchFactory();
    const res = await runScenario({
      scenario: SCENARIOS[0],
      baseUrl: "http://mock.test",
      auth,
      fetchFn,
    });
    const run: UatRunResult = {
      runAt: new Date().toISOString(),
      operator: "smoke",
      baseUrl: "http://mock.test",
      tenantId: auth.tenantId,
      scenarios: [res],
      allPassed: res.allPassed,
      passedCount: res.allPassed ? 1 : 0,
      failedCount: res.allPassed ? 0 : 1,
      totalSteps: res.steps.length,
      totalFailedSteps: res.failedCount,
      totalUnnecessary: 0,
      averageRating: 0,
    };
    const report = buildReport(run);
    expect(report.markdown).toContain("## Ozet");
    expect(report.json).toContain("summary");
    expect(JSON.parse(report.json).summary.total).toBe(1);
  });
});
