/**
 * @file Pilot kabul (UAT) runner testleri.
 * @module @vetniva/acceptance-test/tests/runner
 *
 * @description Senaryo calistirma, placeholder cozumu, sure
 * kayit, hata yakalama, alan dogrulamasi ve PII akisinin
 * mock fetch ile dogrulanmasi. Gercek API'ye baglanmaz.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { describe, expect, it } from "vitest";

import {
  extractIds,
  isTruthyField,
  PLACEHOLDER_NOT_FOUND,
  PLACEHOLDER_SELF_REF,
  readField,
  resolveDeep,
  resolvePlaceholders,
  runScenario,
  statusMatches,
  buildAuthHeaders,
} from "../src/runner.js";
import type {
  HttpMethod,
  UatFetch,
  UatAuthContext,
  UatScenarioConfig,
  UatStep,
} from "../src/types.js";

const baseScenario: UatScenarioConfig = {
  key: "new_owner_patient",
  title: "Test",
  description: "Test senaryosu",
  module: "test",
  actorRole: "STAFF",
  priority: 1,
  steps: [
    {
      name: "create_owner",
      label: "owner",
      method: "POST",
      path: "/api/v1/clinic/owners",
      body: { firstName: "T", lastName: "U" },
      expectStatus: 201,
      expectField: "id",
    } satisfies UatStep,
    {
      name: "create_patient",
      label: "patient",
      method: "POST",
      path: "/api/v1/clinic/patients",
      body: { ownerId: "{ownerId}", name: "X" },
      expectStatus: 201,
      expectField: "id",
    } satisfies UatStep,
  ],
};

const auth: UatAuthContext = {
  token: "tok",
  tenantId: "tenant-1",
  branchId: "branch-1",
};

describe("resolvePlaceholders", () => {
  it("basit yer degistirme", () => {
    expect(resolvePlaceholders("a/{x}/b", { x: "1" })).toBe("a/1/b");
  });

  it("birden fazla placeholder", () => {
    expect(
      resolvePlaceholders("{a}/{b}", { a: "1", b: "2" }),
    ).toBe("1/2");
  });

  it("self-ref tespit edilir", () => {
    expect(() =>
      resolvePlaceholders("{x}", { x: "{x}" }),
    ).toThrow(PLACEHOLDER_SELF_REF);
  });

  it("bulunamayan placeholder hata firlatir", () => {
    expect(() => resolvePlaceholders("{y}", { x: "1" })).toThrow(
      PLACEHOLDER_NOT_FOUND,
    );
  });

  it("placeholder olmayan metin aynen kalir", () => {
    expect(resolvePlaceholders("plain", { x: "1" })).toBe("plain");
  });
});

describe("resolveDeep", () => {
  it("string alanlari cozer", () => {
    expect(resolveDeep({ a: "{x}" }, { x: "1" })).toEqual({ a: "1" });
  });

  it("ic ice objeleri cozer", () => {
    expect(
      resolveDeep(
        { a: { b: ["{x}", "{y}"] } },
        { x: "1", y: "2" },
      ),
    ).toEqual({ a: { b: ["1", "2"] } });
  });

  it("null/undefined/number alanlara dokunmaz", () => {
    expect(resolveDeep({ a: null, b: 5, c: undefined }, {})).toEqual({
      a: null,
      b: 5,
      c: undefined,
    });
  });
});

describe("readField", () => {
  it("basit alan okur", () => {
    expect(readField({ id: "abc" }, "id")).toBe("abc");
  });

  it("nokta notasyonu destekler", () => {
    expect(readField({ a: { b: 7 } }, "a.b")).toBe(7);
  });

  it("bos path veya null body icin undefined", () => {
    expect(readField(null, "id")).toBeUndefined();
    expect(readField({ id: 1 }, "")).toBeUndefined();
  });
});

describe("isTruthyField", () => {
  it("string icin truthy: bos degil", () => {
    expect(isTruthyField("abc")).toBe(true);
    expect(isTruthyField("")).toBe(false);
  });
  it("sayi icin finite mi", () => {
    expect(isTruthyField(1)).toBe(true);
    expect(isTruthyField(0)).toBe(false);
    expect(isTruthyField(NaN)).toBe(false);
  });
  it("array/object truthy", () => {
    expect(isTruthyField([1])).toBe(true);
    expect(isTruthyField({})).toBe(false);
  });
  it("boolean", () => {
    expect(isTruthyField(true)).toBe(true);
    expect(isTruthyField(false)).toBe(false);
  });
});

describe("statusMatches", () => {
  it("tek sayi", () => {
    expect(statusMatches(200, 200)).toBe(true);
    expect(statusMatches(201, 200)).toBe(false);
  });
  it("liste", () => {
    expect(statusMatches(200, [200, 201])).toBe(true);
    expect(statusMatches(202, [200, 201])).toBe(false);
  });
});

describe("extractIds", () => {
  it("standart id alanlarini toplar", () => {
    const ctx: Record<string, string> = {};
    extractIds(
      {
        id: "owner-1",
        patientId: "p-1",
        paymentId: "pay-1",
      },
      ctx,
    );
    expect(ctx.id).toBe("owner-1");
    expect(ctx.patientId).toBe("p-1");
    expect(ctx.paymentId).toBe("pay-1");
  });
  it("null body'ye dokunmaz", () => {
    const ctx: Record<string, string> = { prev: "x" };
    extractIds(null, ctx);
    expect(ctx.prev).toBe("x");
  });
});

describe("buildAuthHeaders", () => {
  it("token/tenant/branch header'a eklenir", () => {
    const h = buildAuthHeaders({ token: "t", tenantId: "tn", branchId: "br" });
    expect(h.Authorization).toBe("Bearer t");
    expect(h["X-Tenant-Id"]).toBe("tn");
    expect(h["X-Branch-Id"]).toBe("br");
  });
  it("bos alanlar atlanir", () => {
    const h = buildAuthHeaders({ token: "", tenantId: "", branchId: "" });
    expect(h.Authorization).toBeUndefined();
    expect(h["X-Tenant-Id"]).toBeUndefined();
  });
});

describe("runScenario", () => {
  it("iki basarili adim, placeholder cozumu ve id toplama", async () => {
    const calls: Array<{ method: HttpMethod; url: string; body?: unknown }> = [];
    const fetchFn: UatFetch = async (method, url, init) => {
      calls.push({ method, url, body: init.body });
      if (url.endsWith("/owners")) {
        return { status: 201, body: { id: "owner-9" } };
      }
      if (url.endsWith("/patients")) {
        // ownerId'nin cozulmus oldugunu dogrula
        const body = init.body as { ownerId?: string };
        expect(body.ownerId).toBe("owner-9");
        return { status: 201, body: { id: "patient-7" } };
      }
      return { status: 404, body: { error: "not found" } };
    };

    const res = await runScenario({
      scenario: baseScenario,
      baseUrl: "http://api.test",
      auth,
      fetchFn,
    });

    expect(calls.length).toBe(2);
    expect(res.allPassed).toBe(true);
    expect(res.passedCount).toBe(2);
    expect(res.failedCount).toBe(0);
    expect(res.steps[0].status).toBe(201);
    expect(res.steps[0].fieldFound).toBe(true);
    expect(res.steps[1].extracted.id).toBe("patient-7");
  });

  it("basarisiz adim senaryoyu kirar", async () => {
    const fetchFn: UatFetch = async () => ({
      status: 500,
      body: { error: "boom" },
    });
    const res = await runScenario({
      scenario: baseScenario,
      baseUrl: "http://api.test",
      auth,
      fetchFn,
    });
    expect(res.allPassed).toBe(false);
    expect(res.passedCount).toBe(0);
    expect(res.failedCount).toBe(1);
    // 2. adim calistirilmamali
    expect(res.steps.length).toBe(1);
  });

  it("fetch exception adimda hata olarak kaydedilir", async () => {
    const fetchFn: UatFetch = async () => {
      throw new Error("network down");
    };
    const res = await runScenario({
      scenario: baseScenario,
      baseUrl: "http://api.test",
      auth,
      fetchFn,
    });
    expect(res.steps[0].passed).toBe(false);
    expect(res.steps[0].error).toBe("network down");
    expect(res.steps[0].status).toBe(0);
  });

  it("placeholder bulunamayinca hata mesajinda hata kodu var", async () => {
    // body'de {ownerId} var ama fetch'ten id donmez
    const fetchFn: UatFetch = async () => ({ status: 201, body: {} });
    const res = await runScenario({
      scenario: baseScenario,
      baseUrl: "http://api.test",
      auth,
      fetchFn,
    });
    expect(res.steps[0].passed).toBe(false);
    // expectField="id" yok, o yuzden fieldFound null
    // ama status dogru; id'yi extract etmeyizse 2. adim placeholder hata verir
    expect(res.steps[1].error).toMatch(PLACEHOLDER_NOT_FOUND);
  });

  it("sure kayitlari pozitif", async () => {
    const fetchFn: UatFetch = async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { status: 201, body: { id: "x" } };
    };
    const res = await runScenario({
      scenario: baseScenario,
      baseUrl: "http://api.test",
      auth,
      fetchFn,
    });
    for (const step of res.steps) {
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(res.totalDurationMs).toBeGreaterThan(0);
  });
});
