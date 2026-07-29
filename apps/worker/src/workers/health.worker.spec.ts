/**
 * @file Health worker unit testleri.
 * @module @vetniva/worker/workers/health.worker.spec
 *
 * @description Worker'ın processor işlevi izole test edilir.
 * BullMQ `Job` benzeri bir payload inşa edilir; `getHealthWorker`
 * çağrısı Redis bağlantısı gerektirdiğinden bu test yalnızca
 * processor mantığını doğrular (gerçek BullMQ entegrasyonu ileride
 * `ioredis-mock` veya testcontainers ile eklenecektir).
 *
 * @security Testlerde gerçek Redis'e bağlanılmaz; yalnızca
 * `processHealthJob` saf fonksiyon olarak test edilir.
 */

import { describe, expect, it } from "vitest";

import { processHealthJob } from "../jobs/health-job.js";
import type { HealthJobPayload } from "../jobs/health-job.js";

describe("health worker processor", () => {
  it("geçerli payload ile sonuç üretir", async () => {
    const payload: HealthJobPayload = { check: "db", requestId: "r-test-1" };
    const result = await processHealthJob(payload);
    expect(result.ok).toBe(true);
    expect(result.checks.length).toBeGreaterThanOrEqual(1);
  });

  it("hatalı payload için exception fırlatır (BullMQ retry tetikler)", async () => {
    const badPayload = { check: "invalid-check" };
    await expect(processHealthJob(badPayload)).rejects.toThrow();
  });

  it("her çağrıda latencyMs >= 0 döner", async () => {
    const result = await processHealthJob({
      check: "db",
      requestId: "r-test-2",
    });
    for (const check of result.checks) {
      expect(check.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("check sonuçlarında name alanı dolu gelir", async () => {
    const result = await processHealthJob({
      check: "db",
      requestId: "r-test-3",
    });
    for (const check of result.checks) {
      expect(typeof check.name).toBe("string");
      expect(check.name.length).toBeGreaterThan(0);
    }
  });
});
