/**
 * @file Threshold karsilastirma ve gecme/kalma motoru.
 * @module @vetniva/load-test/thresholds
 *
 * @description k6 summary JSON ciktisini alip senaryo bazinda
 * p95/p99 latency, hata orani ve RPS degerlerini threshold
 * spec ile karsilastirir. Tenant izolasyonu, audit ve PII
 * kurallarina uyulur; testler yalnizca sentetik veri kullanir.
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import type {
  K6Summary,
  ScenarioConfig,
  ScenarioResult,
  ThresholdFailure,
  ThresholdSpec,
} from "./types.js";

/**
 * k6 metric degerini (string | number | null) guvenli sekilde
 * number'a cevirir. Hata durumunda null doner.
 */
export function readMetricNumber(
  summary: K6Summary,
  metricName: string,
  subKey?: "p(95)" | "p(99)" | "rate" | "count" | "avg",
): number | null {
  const m = summary.metrics[metricName];
  if (!m) return null;
  // k6 v0.x "value" alanini bazi metriklerde kullanirken, k6 v2
  // percentile ve sayaclari dogrudan "p(95)", "count" ve "rate"
  // alanlariyla yazar. Her iki formati da destekle.
  const raw =
    subKey && m[subKey] !== undefined ? m[subKey] : m.value;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;

  if (subKey === "rate") {
    // http_req_failed zaten 0-1 arasinda oran olarak doner
    return n;
  }
  if (subKey === "count") {
    return n;
  }
  if (subKey === "avg") {
    return n;
  }
  // p(95) / p(99) icin k6 zaten dogru degeri "value" olarak verir
  return n;
}

/**
 * k6 summary'den senaryo icin lazim olan metrikleri okur.
 *
 * k6 naming convention (varsayilan):
 *   http_req_duration          -> ortalama / p95 / p99 (default)
 *   http_req_failed            -> 0-1 hata orani (rate)
 *   http_reqs                  -> count (toplam istek)
 *   iteration_duration         -> VU basina iterasyon suresi
 *   iterations                 -> toplam iterasyon
 *
 * duration metrikleri ms cinsindendir; rate 0-1.
 */
export interface ExtractedMetrics {
  p95Ms: number | null;
  p99Ms: number | null;
  errorRate: number;
  requestCount: number;
  iterations: number;
  /** RPS = requestCount / testDurationMs. */
  rps: number | null;
  testDurationMs: number | null;
}

/** k6 summary'den metrikleri cikarir. */
export function extractMetrics(
  summary: K6Summary,
  testDurationMs: number | null,
): ExtractedMetrics {
  const p95 = readMetricNumber(summary, "http_req_duration", "p(95)");
  const p99 = readMetricNumber(summary, "http_req_duration", "p(99)");
  const failedRate = readMetricNumber(summary, "http_req_failed", "rate");
  const reqCount = readMetricNumber(summary, "http_reqs", "count");
  const iters = readMetricNumber(summary, "iterations", "count");

  const requestCount = reqCount !== null ? reqCount : 0;
  const iterations = iters !== null ? iters : 0;
  const errorRate = failedRate !== null ? failedRate : 0;
  const rps =
    testDurationMs && testDurationMs > 0
      ? (requestCount * 1000) / testDurationMs
      : null;

  return {
    p95Ms: p95,
    p99Ms: p99,
    errorRate,
    requestCount,
    iterations,
    rps,
    testDurationMs,
  };
}

/**
 * Tek bir threshold karsilastirmasi yapar. Ihlal varsa
 * ThresholdFailure doner; gectiyse undefined.
 */
export function checkThreshold(
  spec: ThresholdSpec,
  metrics: ExtractedMetrics,
): ReadonlyArray<ThresholdFailure> {
  const failures: ThresholdFailure[] = [];

  // p95 latency
  if (spec.p95Ms > 0) {
    if (metrics.p95Ms === null) {
      failures.push({
        metric: "p95",
        expected: `<= ${spec.p95Ms} ms`,
        actual: null,
        reason: "p95 metrik degeri okunamadi (summary bos / format hatali)",
      });
    } else if (metrics.p95Ms > spec.p95Ms) {
      failures.push({
        metric: "p95",
        expected: `<= ${spec.p95Ms} ms`,
        actual: metrics.p95Ms,
        reason: `p95 latency ${spec.p95Ms} ms esigini asti`,
      });
    }
  }

  // p99 latency (opsiyonel)
  if (spec.p99Ms !== null) {
    if (metrics.p99Ms === null) {
      failures.push({
        metric: "p99",
        expected: `<= ${spec.p99Ms} ms`,
        actual: null,
        reason: "p99 metrik degeri okunamadi",
      });
    } else if (metrics.p99Ms > spec.p99Ms) {
      failures.push({
        metric: "p99",
        expected: `<= ${spec.p99Ms} ms`,
        actual: metrics.p99Ms,
        reason: `p99 latency ${spec.p99Ms} ms esigini asti`,
      });
    }
  }

  // Hata orani
  if (spec.maxErrorRate >= 0) {
    if (metrics.errorRate > spec.maxErrorRate) {
      failures.push({
        metric: "error_rate",
        expected: `<= ${(spec.maxErrorRate * 100).toFixed(2)}%`,
        actual: metrics.errorRate,
        reason: `HTTP hata orani ${(spec.maxErrorRate * 100).toFixed(2)}% esigini asti`,
      });
    }
  }

  // Minimum RPS (opsiyonel)
  if (spec.minRps !== null) {
    if (metrics.rps === null) {
      failures.push({
        metric: "rps",
        expected: `>= ${spec.minRps} rps`,
        actual: null,
        reason: "RPS hesaplanamadi (sure bilinmiyor)",
      });
    } else if (metrics.rps < spec.minRps) {
      failures.push({
        metric: "rps",
        expected: `>= ${spec.minRps} rps`,
        actual: metrics.rps,
        reason: `RPS ${spec.minRps} altinda`,
      });
    }
  }

  return failures;
}

/**
 * Tek senaryo icin K6Summary + config'den ScenarioResult uretir.
 */
export function evaluateScenario(
  scenario: ScenarioConfig,
  summary: K6Summary,
  profile: ScenarioResult["profile"],
  testDurationMs: number | null,
): ScenarioResult {
  const metrics = extractMetrics(summary, testDurationMs);
  const failures = checkThreshold(scenario.thresholds, metrics);
  return {
    scenario: scenario.key,
    title: scenario.title,
    profile,
    p95Ms: metrics.p95Ms,
    p99Ms: metrics.p99Ms,
    errorRate: metrics.errorRate,
    rps: metrics.rps ?? 0,
    passed: failures.length === 0,
    failures,
  };
}
