/**
 * @file JobRunsRepository kalıcı indeks testleri.
 * @module apps/api/modules/job-runs/job-runs.repository.spec
 * @description Worker'ın PostgreSQL'e yazdığı JobRun satırlarının API
 * başlangıcında superadmin RLS bağlamıyla okunup hızlı indekse yüklendiğini
 * doğrular. Bu okuma tenant kimliği olmadan yalnız superadmin transaction'ı
 * içinde yapılmalıdır.
 */

import { describe, expect, it, vi } from "vitest";

import { JobRunsRepository } from "./job-runs.repository.js";

import type { PrismaService } from "../../prisma/prisma.service.js";

describe("JobRunsRepository.onModuleInit", () => {
  it("kalıcı worker kaydını superadmin RLS transaction'ıyla indekse yükler", async () => {
    const startedAt = new Date("2026-08-02T10:00:00.000Z");
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      jobRun: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "11111111-1111-1111-1111-111111111111",
            queueName: "health",
            jobName: "health-check",
            jobKey: "health-1",
            source: "queue",
            status: "succeeded",
            attempt: 1,
            maxAttempts: 3,
            tenantId: null,
            branchId: null,
            correlationId: "health-1",
            requestId: null,
            actorId: null,
            actorType: "system",
            input: {},
            output: { ok: true },
            errorCode: null,
            errorMessage: null,
            errorStack: null,
            startedAt,
            finishedAt: new Date("2026-08-02T10:00:01.000Z"),
            durationMs: 1000,
            parentRunId: null,
            triggeredBy: "system",
            country: "SYSTEM",
            release: "0.1.0",
          },
        ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new JobRunsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.onModuleInit();

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.jobRun.findMany).toHaveBeenCalledWith({
      orderBy: { startedAt: "asc" },
    });
    expect(
      repository.findById("11111111-1111-1111-1111-111111111111"),
    ).toMatchObject({
      status: "succeeded",
      output: { ok: true },
      startedAt: startedAt.toISOString(),
    });
  });
});
