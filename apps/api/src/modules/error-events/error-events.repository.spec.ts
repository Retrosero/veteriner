/**
 * @file ErrorEventsRepository kalıcı snapshot testleri.
 * @module apps/api/modules/error-events/error-events.repository.spec
 * @description GOAL-100 hata aggregate'inin Prisma transaction'ı ve tenant
 * RLS bağlamı üzerinden kalıcılaştırılmasını doğrular.
 * @security Tenant kaydı yazılmadan önce `app.tenant_id` bağlamı aynı
 * transaction içinde kurulmalıdır; aksi halde RLS cross-tenant yazımı
 * engellemek için yeterli kanıt üretemez.
 */

import { describe, expect, it, vi } from "vitest";

import { ErrorEventsRepository } from "./error-events.repository.js";

import type { ErrorEventRecord } from "../../common/error-events/error-event.types.js";
import type { PrismaService } from "../../prisma/prisma.service.js";

const record: ErrorEventRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  requestId: "req-1",
  tenantId: "22222222-2222-2222-2222-222222222222",
  branchId: "33333333-3333-3333-3333-333333333333",
  userId: "44444444-4444-4444-4444-444444444444",
  actorType: "user",
  module: "patient",
  route: "GET /api/v1/patient/1",
  release: "0.1.0",
  severity: "error",
  fingerprint: "0123456789abcdef",
  errorCode: "VET-COMMON-0001",
  message: "Beklenmeyen sunucu hatası",
  statusCode: 500,
  stack: "Error: test",
  context: { method: "GET" },
  country: "TR",
  occurredAt: "2026-08-02T00:00:00.000Z",
  firstSeenAt: "2026-08-02T00:00:00.000Z",
  lastSeenAt: "2026-08-02T00:00:00.000Z",
  occurrenceCount: 1,
  status: "new",
  assignedToUserId: null,
};

describe("ErrorEventsRepository.persistSnapshot", () => {
  it("tenant kaydını aynı transaction içinde RLS bağlamıyla yazar", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      errorEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.persistSnapshot(record);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.errorEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Vitest'in asymmetric matcher tipi `any` döndürür; assertion sınırı
        // dışında bu değer kullanılmaz.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          id: record.id,
          tenantId: record.tenantId,
          fingerprint: record.fingerprint,
        }),
      }),
    );
  });

  it("paralel fingerprint create çakışmasında oluşan aggregate'i günceller", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      errorEvent: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: record.id }),
        create: vi.fn().mockRejectedValue(new Error("unique conflict")),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.persistSnapshot(record);

    expect(tx.errorEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: record.id } }),
    );
  });
});

describe("ErrorEventsRepository.onModuleInit", () => {
  it("kalıcı aggregate'leri tenant kapsamlı hızlı indekse yükler", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      errorEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...record,
            occurredAt: new Date(record.occurredAt),
            firstSeenAt: new Date(record.firstSeenAt),
            lastSeenAt: new Date(record.lastSeenAt),
          },
        ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.onModuleInit();

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(
      repository.findByFingerprint(record.fingerprint, record.tenantId),
    ).toEqual(record);
  });
});
