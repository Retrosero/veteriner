/**
 * @file thresholds.test.ts — threshold motoru testleri.
 * @module @vetniva/load-test/tests/thresholds
 *
 * @description p95/p99 latency, hata orani, RPS threshold
 * kontrollerinin dogru calistigini dogrular. Tenant izolasyonu
 * ve PII kurallarina uyar.
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import { describe, it, expect } from "vitest";

import {
  readMetricNumber,
  extractMetrics,
  checkThreshold,
  evaluateScenario,
} from "../src/thresholds.js";
import type {
  K6Summary,
  ScenarioConfig,
  ThresholdSpec,
} from "../src/types.js";

const SUMMARY_OK: K6Summary = {
  metrics: {
    http_req_duration: {
      name: "http_req_duration",
      value: 0, // default, p(95)/p(99) subKey ile okunur
    },
    http_req_failed: {
      name: "http_req_failed",
      value: 0.0,
    },
    http_reqs: {
      name: "http_reqs",
      value: 1000,
    },
    iterations: {
      name: "iterations",
      value: 50,
    },
  },
};

function withP95(summary: K6Summary, p95: number, p99 = p95 * 1.5): K6Summary {
  // k6 summary ciktisinda http_req_duration.avg / p(95) / p(99) subKeys olur
  // Ancak "value" default olarak ortalama okunur; bizim extractMetrics
  // sadece "value" alanina bakiyor. Bu yuzden testlerde custom metric
  // ismi kullaniyoruz: http_req_duration_p95 / http_req_duration_p99
  // gibi. Bu nedenle testte subKey'i "value" + custom isimle yapiyoruz.
  return {
    metrics: {
      ...summary.metrics,
      http_req_duration: { name: "http_req_duration", value: p95 },
      "http_req_duration{p(95:)}": { name: "http_req_duration{p(95:)}", value: p95 },
      "http_req_duration{p(99:)}": { name: "http_req_duration{p(99:)}", value: p99 },
    },
  };
}

describe("readMetricNumber", () => {
  it("mevcut numeric metric icin deger doner", () => {
    const s: K6Summary = {
      metrics: { foo: { name: "foo", value: 42 } },
    };
    expect(readMetricNumber(s, "foo")).toBe(42);
  });

  it("string numeric metric icin parse eder", () => {
    const s: K6Summary = {
      metrics: { foo: { name: "foo", value: "12.5" as never } },
    };
    expect(readMetricNumber(s, "foo")).toBe(12.5);
  });

  it("olmayan metric null doner", () => {
    expect(readMetricNumber(SUMMARY_OK, "missing")).toBeNull();
  });

  it("NaN / Infinity icin null doner", () => {
    const s: K6Summary = {
      metrics: { foo: { name: "foo", value: NaN as never } },
    };
    expect(readMetricNumber(s, "foo")).toBeNull();
  });
});

describe("extractMetrics", () => {
  it("RPS = requestCount * 1000 / durationMs", () => {
    const s = withP95(SUMMARY_OK, 100);
    const out = extractMetrics(s, 10_000);
    expect(out.p95Ms).toBe(100);
    expect(out.requestCount).toBe(1000);
    expect(out.rps).toBe(100);
  });

  it("durationMs null ise rps null doner", () => {
    const out = extractMetrics(SUMMARY_OK, null);
    expect(out.rps).toBeNull();
  });

  it("durationMs 0 ise rps null (sifira bolme korunmasi)", () => {
    const out = extractMetrics(SUMMARY_OK, 0);
    expect(out.rps).toBeNull();
  });

  it("http_req_failed rate 0-1 olarak okunur", () => {
    const s: K6Summary = {
      metrics: {
        ...SUMMARY_OK.metrics,
        http_req_failed: { name: "http_req_failed", value: 0.012 },
      },
    };
    const out = extractMetrics(s, 5000);
    expect(out.errorRate).toBeCloseTo(0.012, 5);
  });
});

describe("checkThreshold", () => {
  const spec: ThresholdSpec = {
    p95Ms: 500,
    p99Ms: 1000,
    maxErrorRate: 0.01,
    minRps: 10,
  };

  it("p95 altinda PASS", () => {
    const failures = checkThreshold(spec, {
      p95Ms: 400,
      p99Ms: 800,
      errorRate: 0,
      requestCount: 1000,
      iterations: 100,
      rps: 50,
      testDurationMs: 20000,
    });
    expect(failures).toHaveLength(0);
  });

  it("p95 asildiginda FAIL uretir", () => {
    const failures = checkThreshold(spec, {
      p95Ms: 600,
      p99Ms: 800,
      errorRate: 0,
      requestCount: 1000,
      iterations: 100,
      rps: 50,
      testDurationMs: 20000,
    });
    expect(failures.some((f) => f.metric === "p95")).toBe(true);
  });

  it("p99 asildiginda FAIL uretir", () => {
    const failures = checkThreshold(spec, {
      p95Ms: 400,
      p99Ms: 1200,
      errorRate: 0,
      requestCount: 1000,
      iterations: 100,
      rps: 50,
      testDurationMs: 20000,
    });
    expect(failures.some((f) => f.metric === "p99")).toBe(true);
  });

  it("hata orani asildiginda FAIL uretir", () => {
    const failures = checkThreshold(spec, {
      p95Ms: 400,
      p99Ms: 800,
      errorRate: 0.02,
      requestCount: 1000,
      iterations: 100,
      rps: 50,
      testDurationMs: 20000,
    });
    expect(failures.some((f) => f.metric === "error_rate")).toBe(true);
  });

  it("RPS dusuk ise FAIL uretir", () => {
    const failures = checkThreshold(spec, {
      p95Ms: 400,
      p99Ms: 800,
      errorRate: 0,
      requestCount: 100,
      iterations: 10,
      rps: 5,
      testDurationMs: 20000,
    });
    expect(failures.some((f) => f.metric === "rps")).toBe(true);
  });

  it("minRps null ise RPS kontrol edilmez", () => {
    const loose: ThresholdSpec = { ...spec, minRps: null };
    const failures = checkThreshold(loose, {
      p95Ms: 400,
      p99Ms: 800,
      errorRate: 0,
      requestCount: 1,
      iterations: 1,
      rps: 0.001,
      testDurationMs: 20000,
    });
    expect(failures.some((f) => f.metric === "rps")).toBe(false);
  });

  it("p99Ms null ise p99 kontrol edilmez", () => {
    const loose: ThresholdSpec = { ...spec, p99Ms: null };
    const failures = checkThreshold(loose, {
      p95Ms: 400,
      p99Ms: 9999,
      errorRate: 0,
      requestCount: 1000,
      iterations: 100,
      rps: 50,
      testDurationMs: 20000,
    });
    expect(failures.some((f) => f.metric === "p99")).toBe(false);
  });
});

describe("evaluateScenario", () => {
  const scenario: ScenarioConfig = {
    key: "patient_search",
    title: "Hasta arama",
    description: "x",
    steps: [{ name: "search", method: "GET", path: "/api/v1/owners", requiresAuth: true }],
    thresholds: { p95Ms: 500, p99Ms: 1000, maxErrorRate: 0.01, minRps: 10 },
    recommendedProfiles: ["pilot"],
  };

  it("gecen senaryo passed:true doner", () => {
    const r = evaluateScenario(
      scenario,
      withP95(SUMMARY_OK, 300),
      "pilot",
      10_000,
    );
    expect(r.passed).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it("kalan senaryo passed:false + failures icerir", () => {
    const r = evaluateScenario(
      scenario,
      withP95(SUMMARY_OK, 700),
      "pilot",
      10_000,
    );
    expect(r.passed).toBe(false);
    expect(r.failures.length).toBeGreaterThan(0);
  });

  it("senaryo basligi ve profili korunur", () => {
    const r = evaluateScenario(
      scenario,
      withP95(SUMMARY_OK, 200),
      "pilot",
      5000,
    );
    expect(r.scenario).toBe("patient_search");
    expect(r.title).toBe("Hasta arama");
    expect(r.profile).toBe("pilot");
  });
});
