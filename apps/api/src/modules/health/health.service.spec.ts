/**
 * @file HealthService unit testi.
 * @module apps/api/modules/health
 *
 * @description PrismaService'i mock'layarak health check davranışını
 * izole biçimde doğrular.
 */

import { describe, expect, it, vi } from "vitest";

import { HealthService } from "./health.service.js";

const makePrisma = (impl: () => Promise<unknown>) =>
  ({
    $queryRaw: vi.fn().mockImplementation(impl),
  }) as unknown as ConstructorParameters<typeof HealthService>[0];

describe("HealthService", () => {
  it("db.status = ok ve latency_ms raporlanır", async () => {
    const prisma = makePrisma(async () => 1);
    const service = new HealthService(prisma);
    const result = await service.checkDatabase();
    expect(result.status).toBe("ok");
    expect(typeof result.latency_ms).toBe("number");
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("db.status = down hata durumunda", async () => {
    const prisma = makePrisma(async () => {
      throw new Error("connection refused");
    });
    const service = new HealthService(prisma);
    const result = await service.checkDatabase();
    expect(result.status).toBe("down");
    expect(result.message).toBeTruthy();
  });
});
