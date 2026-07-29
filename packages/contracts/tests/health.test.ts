/**
 * @file @vetniva/contracts unit testleri.
 * @module @vetniva/contracts/tests
 *
 * @description Paylaşılan sözleşmelerin geçerli/Geçersiz veri örnekleriyle
 * doğrulanması. Bu testler CI'da zorunludur.
 */

import { describe, expect, it } from "vitest";

import {
  errorCodeSchema,
  errorResponseSchema,
  livenessResponseSchema,
  readinessResponseSchema,
} from "../src/index.js";

describe("contracts.health", () => {
  it("livenessResponseSchema geçerli payload kabul eder", () => {
    const ok = livenessResponseSchema.safeParse({
      status: "ok",
      timestamp: "2026-07-29T19:00:00.000Z",
    });
    expect(ok.success).toBe(true);
  });

  it("livenessResponseSchema bilinmeyen status reddeder", () => {
    const bad = livenessResponseSchema.safeParse({
      status: "unknown",
      timestamp: "2026-07-29T19:00:00.000Z",
    });
    expect(bad.success).toBe(false);
  });

  it("readinessResponseSchema tam payload kabul eder", () => {
    const ok = readinessResponseSchema.safeParse({
      status: "degraded",
      timestamp: "2026-07-29T19:00:00.000Z",
      version: {
        name: "vetniva-api",
        version: "0.1.0",
        build_sha: "abc1234",
        build_time: "2026-07-29T18:55:00.000Z",
      },
      components: {
        db: { status: "ok", latency_ms: 12 },
      },
    });
    expect(ok.success).toBe(true);
  });
});

describe("contracts.error", () => {
  it("errorCodeSchema doğru format kabul eder", () => {
    const ok = errorCodeSchema.safeParse("TR_CLINIC_0001");
    expect(ok.success).toBe(true);
  });

  it("errorCodeSchema hatalı format reddeder", () => {
    const bad = errorCodeSchema.safeParse("clin-001");
    expect(bad.success).toBe(false);
  });

  it("errorResponseSchema tam payload kabul eder", () => {
    const ok = errorResponseSchema.safeParse({
      error_code: "TR_COMMON_0001",
      message: "Örnek hata",
      source: "server",
      severity: "error",
      correlation_id: "req-abc123",
      timestamp: "2026-07-29T19:00:00.000Z",
    });
    expect(ok.success).toBe(true);
  });
});
