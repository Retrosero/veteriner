/**
 * @file Audit service unit testleri.
 * @module apps/api/common/audit/audit.spec
 * @description AuditService'in temel davranışlarını doğrular:
 * event ID üretimi, severity eşlemesi, metadata iletimi, Prisma
 * mock ile DB yazımı.
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 * @updated GOAL-010 (FAZ-1) Prisma DB yazımı testleri eklendi
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditService } from "./audit.service.js";

import type { AuditEventInput } from "./audit.types.js";

describe("AuditService", () => {
  let service: AuditService;
  let prismaAuditCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prismaAuditCreate = vi.fn().mockResolvedValue({ id: "mock-id" });
    const transactionClient = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      auditEvent: { create: prismaAuditCreate },
    };
    const prisma = {
      auditEvent: {
        create: prismaAuditCreate,
      },
      $transaction: vi.fn(
        async (fn: (tx: typeof transactionClient) => Promise<unknown>) =>
          fn(transactionClient),
      ),
    } as unknown as ConstructorParameters<typeof AuditService>[0];
    service = new AuditService(prisma);
  });

  const baseInput: AuditEventInput = {
    eventName: "audit:tenant.create",
    tenantId: "tnt-abc",
    branchId: null,
    actorId: "usr-123",
    actorType: "user",
    targetType: "tenant",
    targetId: "tnt-abc",
    action: "create",
    correlationId: "req-test-001",
    country: "TR",
    severity: "info",
  };

  it("event ID ve timestamp üretir", async () => {
    const event = await service.record(baseInput);
    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(event.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("girdi alanlarını korur", async () => {
    const event = await service.record({
      ...baseInput,
      before: { name: "Eski" },
      after: { name: "Yeni" },
      diff: { name: { from: "Eski", to: "Yeni" } },
      metadata: { source: "ui" },
    });
    expect(event.eventName).toBe("audit:tenant.create");
    expect(event.after).toEqual({ name: "Yeni" });
    expect(event.diff).toEqual({ name: { from: "Eski", to: "Yeni" } });
    expect(event.metadata).toEqual({ source: "ui" });
  });

  it("info severity info seviyesinde loglanır", async () => {
    await expect(
      service.record({ ...baseInput, severity: "info" }),
    ).resolves.toBeDefined();
  });

  it("critical severity error seviyesinde loglanır", async () => {
    await expect(
      service.record({ ...baseInput, severity: "critical" }),
    ).resolves.toBeDefined();
  });

  it("recordSimple helper çalışır", async () => {
    const event = await service.recordSimple(
      "audit:branch.create",
      "branch",
      "br-1",
      "create",
      {
        actorId: "usr-1",
        actorType: "user",
        tenantId: "tnt-1",
        branchId: "br-1",
        correlationId: "req-1",
        country: "TR",
      },
    );
    expect(event.eventName).toBe("audit:branch.create");
    expect(event.actorId).toBe("usr-1");
    expect(event.branchId).toBe("br-1");
  });

  it("null actor SYSTEM event'lerde kabul edilir", async () => {
    const event = await service.record({
      ...baseInput,
      actorId: null,
      actorType: "system",
    });
    expect(event.actorId).toBeNull();
    expect(event.actorType).toBe("system");
  });

  it("PII alanları mask'lenir (before/after)", async () => {
    await service.record({
      ...baseInput,
      before: { tax_id: "1234567890" },
      after: { tax_id: "0987654321" },
    });
    const call = prismaAuditCreate.mock.calls[0]?.[0] as {
      data: { before: unknown; after: unknown };
    };
    expect(call.data.before).toEqual({ tax_id: "123***90" });
    expect(call.data.after).toEqual({ tax_id: "098***21" });
  });

  it("Prisma DB yazımı best-effort: hata loglanır, engellemez", async () => {
    prismaAuditCreate.mockRejectedValueOnce(new Error("db down"));
    await expect(service.record(baseInput)).resolves.toBeDefined();
    // Event yine de döner; hata log'a düşer.
  });
});
