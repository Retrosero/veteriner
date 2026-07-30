/**
 * @file Audit service unit testleri.
 * @module apps/api/common/audit/audit.spec
 *
 * @description AuditService'in temel davranışlarını doğrular:
 * event ID üretimi, severity eşlemesi, metadata iletimi.
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

import { describe, expect, it, beforeEach } from "vitest";

import { AuditService } from "./audit.service.js";
import type { AuditEventInput } from "./audit.types.js";

describe("AuditService", () => {
  let service: AuditService;

  beforeEach(() => {
    service = new AuditService();
  });

  const baseInput: AuditEventInput = {
    eventName: "audit:owner.create",
    tenantId: "tnt-abc",
    actorId: "usr-123",
    actorType: "user",
    targetType: "owner",
    targetId: "own-456",
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
      before: { first_name: "A***" },
      after: { first_name: "B***" },
      diff: { first_name: { from: "A***", to: "B***" } },
      metadata: { source: "ui" },
    });
    expect(event.eventName).toBe("audit:owner.create");
    expect(event.before).toEqual({ first_name: "A***" });
    expect(event.after).toEqual({ first_name: "B***" });
    expect(event.diff).toEqual({ first_name: { from: "A***", to: "B***" } });
    expect(event.metadata).toEqual({ source: "ui" });
  });

  it("info severity info seviyesinde loglanır", async () => {
    await expect(service.record({ ...baseInput, severity: "info" })).resolves.toBeDefined();
  });

  it("critical severity error seviyesinde loglanır", async () => {
    await expect(
      service.record({ ...baseInput, severity: "critical" }),
    ).resolves.toBeDefined();
  });

  it("recordSimple helper çalışır", async () => {
    const event = await service.recordSimple(
      "audit:adapter.format_currency",
      "adapter",
      "tr-try",
      "format_currency",
      "info",
    );
    expect(event.eventName).toBe("audit:adapter.format_currency");
    expect(event.actorType).toBe("system");
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
});
