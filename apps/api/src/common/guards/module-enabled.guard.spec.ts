/**
 * @file ModuleEnabledGuard unit testleri.
 * @module apps/api/common/guards/module-enabled.guard.spec
 *
 * @description Guard davranışlarını doğrular:
 * - @RequireModule yoksa guard pasif
 * - Modül enabled → geçer
 * - Modül disabled → 403 VET-MODULE-0001
 * - SUPERADMIN modülden bağımsız geçer
 * - Birden fazla modülde OR mantığı (bir tane enabled yeterli)
 *
 * @since GOAL-013 (FAZ-1) modül/feature flag altyapısı
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { ActorContext } from "../actor/actor-context.service.js";
import { REQUIRE_MODULE_KEY } from "../decorators/require-module.decorator.js";
import type { ModuleKey } from "../modules/module.types.js";
import { FeatureFlagService } from "../../modules/feature-flag/feature-flag.service.js";
import { ModuleEnabledGuard } from "./module-enabled.guard.js";

function makeContext(args: {
  actor?: ActorContext;
}): ExecutionContext {
  return {
    getHandler: () => ({}) as never,
    getClass: () => ({}) as never,
    switchToHttp: () => ({
      getRequest: () => ({ actor: args.actor }),
    }),
  } as unknown as ExecutionContext;
}

function makeReflector(required: ReadonlyArray<ModuleKey>): Reflector {
  const r = new Reflector();
  vi.spyOn(r, "getAllAndOverride").mockImplementation(
    ((key: string) => {
      if (key === REQUIRE_MODULE_KEY) return required;
      return undefined;
    }) as never,
  );
  return r;
}

function makeActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    actorId: "user-1",
    actorType: "user",
    role: "OWNER",
    tenantId: "tnt-1",
    branchId: null,
    isSuperadmin: false,
    correlationId: "req-guard",
    ipAddress: null,
    userAgentHash: null,
    source: "session",
    ...overrides,
  };
}

describe("ModuleEnabledGuard", () => {
  let flags: FeatureFlagService;
  let guard: ModuleEnabledGuard;

  beforeEach(() => {
    flags = new FeatureFlagService({
      record: vi.fn().mockResolvedValue({ eventId: "evt" }),
    } as never);
    // guard her testte reflector ile yeniden oluşturulur
  });

  it("@RequireModule yoksa guard pasif (geçer)", async () => {
    const reflector = makeReflector([]);
    guard = new ModuleEnabledGuard(reflector, flags);
    const ctx = makeContext({ actor: makeActor() });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("modül enabled → geçer", async () => {
    const reflector = makeReflector(["appointments"]);
    guard = new ModuleEnabledGuard(reflector, flags);
    const ctx = makeContext({ actor: makeActor() });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("modül disabled → 403 VET-MODULE-0001 fırlatır", async () => {
    const actor = makeActor();
    await flags.disableModule("tnt-1", "appointments", actor);
    const reflector = makeReflector(["appointments"]);
    guard = new ModuleEnabledGuard(reflector, flags);
    const ctx = makeContext({ actor });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      errorCode: "VET-MODULE-0001",
      httpStatus: 403,
    });
  });

  it("SUPERADMIN modülden bağımsız geçer (master switch)", async () => {
    const actor = makeActor({ isSuperadmin: true });
    await flags.disableModule("tnt-1", "appointments", actor);
    const reflector = makeReflector(["appointments"]);
    guard = new ModuleEnabledGuard(reflector, flags);
    const ctx = makeContext({ actor });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("birden fazla modülde OR: bir tane enabled yeterli", async () => {
    const actor = makeActor();
    await flags.disableModule("tnt-1", "appointments", actor);
    // "billing" default enabled kalıyor.
    const reflector = makeReflector(["appointments", "billing"]);
    guard = new ModuleEnabledGuard(reflector, flags);
    const ctx = makeContext({ actor });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("actor yoksa guard pasif (auth katmanı sonra reddeder)", async () => {
    const reflector = makeReflector(["appointments"]);
    guard = new ModuleEnabledGuard(reflector, flags);
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("SUPERADMIN olmayan ve tenantId yoksa 403 fırlatır", async () => {
    const reflector = makeReflector(["appointments"]);
    guard = new ModuleEnabledGuard(reflector, flags);
    const ctx = makeContext({ actor: makeActor({ tenantId: null }) });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      errorCode: "VET-MODULE-0001",
    });
  });
});
