/**
 * @file Health job Zod şeması + processor unit testleri.
 * @module @vetniva/worker/jobs/health-job.test
 *
 * @description `healthJobPayloadSchema` doğrulaması ve
 * `processHealthJob` processor'ının geçerli payload ile çağrı
 * davranışı test edilir. Redis bağımlı testler bu aşamada
 * mock'suz çalışmaz; sadece `db` check'i (no-op) doğrulanır.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { healthJobPayloadSchema, processHealthJob } from "./health-job.js";

describe("healthJobPayloadSchema", () => {
  it("geçerli payload kabul edilir", () => {
    const result = healthJobPayloadSchema.safeParse({
      check: "all",
      requestId: "req-abc-123",
    });
    expect(result.success).toBe(true);
  });

  it("tüm check enum değerlerini kabul eder", () => {
    for (const check of ["db", "redis", "all"] as const) {
      const result = healthJobPayloadSchema.safeParse({
        check,
        requestId: "r1",
      });
      expect(result.success).toBe(true);
    }
  });

  it("bilinmeyen check enum değerini reddeder", () => {
    const result = healthJobPayloadSchema.safeParse({
      check: "kafka",
      requestId: "r1",
    });
    expect(result.success).toBe(false);
  });

  it("eksik requestId alanını reddeder", () => {
    const result = healthJobPayloadSchema.safeParse({ check: "all" });
    expect(result.success).toBe(false);
  });

  it("boş requestId reddeder", () => {
    const result = healthJobPayloadSchema.safeParse({
      check: "all",
      requestId: "",
    });
    expect(result.success).toBe(false);
  });

  it("eksik check alanını reddeder", () => {
    const result = healthJobPayloadSchema.safeParse({ requestId: "r1" });
    expect(result.success).toBe(false);
  });

  it("ek alan varlığını kabul eder (forward compatibility)", () => {
    const result = healthJobPayloadSchema.safeParse({
      check: "db",
      requestId: "r1",
      extra: "metadata",
    });
    // Zod default olarak ek alanları strip eder; hata fırlatmaz.
    expect(result.success).toBe(true);
  });
});

describe("processHealthJob", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("geçersiz payload için exception fırlatır", async () => {
    await expect(processHealthJob({ check: "invalid" })).rejects.toThrow(
      /payload doğrulaması başarısız/,
    );
  });

  it("null payload için exception fırlatır", async () => {
    await expect(processHealthJob(null)).rejects.toThrow();
  });

  it('"db" check no-op sonuç döner (GOAL-000)', async () => {
    const result = await processHealthJob({ check: "db", requestId: "r1" });
    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(1);
    const dbCheck = result.checks[0];
    expect(dbCheck).toBeDefined();
    expect(dbCheck?.name).toBe("db");
    expect(dbCheck?.status).toBe("noop");
    expect(typeof dbCheck?.latencyMs).toBe("number");
  });
});
