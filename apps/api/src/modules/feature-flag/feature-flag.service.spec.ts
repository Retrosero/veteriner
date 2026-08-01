/**
 * @file FeatureFlagService unit testleri.
 * @module apps/api/modules/feature-flag/feature-flag.service.spec
 *
 * @description Service'in temel davranışlarını doğrular:
 * - Default tüm modüller enabled
 * - enableModule sonrası isModuleEnabled true
 * - disableModule sonrası isModuleEnabled false
 * - listModules tüm modülleri döner
 * - enable/disable audit event üretir (info / warning)
 *
 * @since GOAL-013 (FAZ-1) modül/feature flag altyapısı
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeatureFlagService } from "./feature-flag.service.js";
import { type AuditService } from "../../common/audit/audit.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

function makeActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    actorId: "usr-owner-1",
    actorType: "user",
    role: "OWNER",
    tenantId: "tnt-1",
    branchId: "branch-1",
    isSuperadmin: false,
    correlationId: "req-flag-test",
    ipAddress: null,
    userAgentHash: null,
    source: "session",
    ...overrides,
  };
}

describe("FeatureFlagService", () => {
  let service: FeatureFlagService;
  let auditRecord: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    auditRecord = vi.fn().mockResolvedValue({ eventId: "evt-mock" });
    const audit = { record: auditRecord } as unknown as AuditService;
    service = new FeatureFlagService(audit);
  });

  it("default: tüm modüller enabled", async () => {
    const result = await service.listModules("tnt-fresh");
    expect(result.length).toBeGreaterThanOrEqual(10);
    for (const item of result) {
      expect(item.enabled).toBe(true);
    }
    // Henüz disable edilmemiş bir modül için de true.
    expect(await service.isModuleEnabled("tnt-fresh", "appointments")).toBe(
      true,
    );
  });

  it("enableModule sonrası isModuleEnabled true döner", async () => {
    const actor = makeActor();
    await service.disableModule("tnt-1", "billing", actor);
    expect(await service.isModuleEnabled("tnt-1", "billing")).toBe(false);
    await service.enableModule("tnt-1", "billing", actor);
    expect(await service.isModuleEnabled("tnt-1", "billing")).toBe(true);
  });

  it("disableModule sonrası isModuleEnabled false döner", async () => {
    const actor = makeActor();
    expect(await service.isModuleEnabled("tnt-1", "appointments")).toBe(true);
    await service.disableModule("tnt-1", "appointments", actor);
    expect(await service.isModuleEnabled("tnt-1", "appointments")).toBe(false);
  });

  it("enableModule audit event yazar (info)", async () => {
    const actor = makeActor();
    await service.enableModule("tnt-1", "imaging", actor);
    expect(auditRecord).toHaveBeenCalledTimes(1);
    const [call] = auditRecord.mock.calls[0] as [Record<string, unknown>];
    expect(call["eventName"]).toBe("audit:feature_flag.enable");
    expect(call["severity"]).toBe("info");
    expect(call["targetType"]).toBe("tenant_module");
    expect(call["tenantId"]).toBe("tnt-1");
  });

  it("disableModule audit event yazar (warning)", async () => {
    const actor = makeActor();
    await service.disableModule("tnt-1", "petshop", actor);
    expect(auditRecord).toHaveBeenCalledTimes(1);
    const [call] = auditRecord.mock.calls[0] as [Record<string, unknown>];
    expect(call["eventName"]).toBe("audit:feature_flag.disable");
    expect(call["severity"]).toBe("warning");
  });

  it("listModules tüm katalog modüllerini sıralı döner", async () => {
    const actor = makeActor();
    await service.disableModule("tnt-1", "hospitalization", actor);
    const result = await service.listModules("tnt-1");
    expect(result.length).toBe(10);
    const found = result.find((m) => m.key === "hospitalization");
    expect(found?.enabled).toBe(false);
  });

  it("bilinmeyen modül anahtarı false döner (defensive)", async () => {
    // Cast ile zorla invalid değer geçiyoruz; runtime guard bunu
    // yakalamalı.
    const result = await service.isModuleEnabled(
      "tnt-1",
      "ghost" as unknown as Parameters<typeof service.isModuleEnabled>[1],
    );
    expect(result).toBe(false);
  });
});
