/**
 * @file PermissionsGuard unit testleri.
 * @module apps/api/common/guards/permissions.guard.spec
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PermissionsGuard } from "./permissions.guard.js";
import { RbacService } from "../../modules/rbac/rbac.service.js";
import { type AuthService } from "../auth/auth.service.js";
import { PERMISSIONS_KEY } from "../decorators/require-permissions.decorator.js";

import type {
  ActorContext,
  ActorRole,
} from "../actor/actor-context.service.js";
import type { ExecutionContext } from "@nestjs/common";

/**
 *
 * @param args
 * @param args.actor
 */
function makeContext(args: { actor?: ActorContext }): ExecutionContext {
  return {
    getHandler: () =>
      ({}) as unknown as ExecutionContext["getHandler"] extends () => infer H
        ? H
        : never,
    getClass: () =>
      ({}) as unknown as ExecutionContext["getClass"] extends () => infer C
        ? C
        : never,
    switchToHttp: () => ({
      getRequest: () => ({
        actor: args.actor,
        requestId: "req-test",
      }),
    }),
  } as unknown as ExecutionContext;
}

/**
 *
 * @param perms
 */
function makeReflector(perms: ReadonlyArray<string>): Reflector {
  const r = new Reflector();
  vi.spyOn(r, "getAllAndOverride").mockImplementation(((
    key: string,
    _targets: unknown[],
  ) => {
    if (key === PERMISSIONS_KEY) return perms;
    return undefined;
  }) as never);
  return r;
}

/**
 *
 * @param overrides
 */
function makeActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    actorId: "user-1",
    actorType: "user",
    role: "STAFF" as ActorRole,
    tenantId: "tnt-1",
    branchId: "branch-1",
    isSuperadmin: false,
    correlationId: "req-test",
    ipAddress: null,
    userAgentHash: null,
    source: "session",
    ...overrides,
  };
}

describe("PermissionsGuard — GOAL-012 minimum core", () => {
  let rbac: RbacService;

  beforeEach(() => {
    const authStub = {
      validateSession: vi.fn(),
    } as unknown as AuthService;
    rbac = new RbacService(authStub);
  });

  it("Public endpoint → guard devre dışı (metadata boş döner)", () => {
    const reflector = makeReflector([]);
    const publicGuard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({});
    expect(publicGuard.canActivate(ctx)).toBe(true);
  });

  it("Doğru permission varsa geçer", () => {
    const reflector = makeReflector(["clinic:owner:read"]);
    const guard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({
      actor: makeActor({ role: "OWNER" as ActorRole }),
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("Yanlış permission / system actor → 403 VET-AUTHZ-0001", () => {
    const reflector = makeReflector(["clinic:owner:read"]);
    const guard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({
      actor: makeActor({ actorType: "system", role: "SYSTEM" as ActorRole }),
    });
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it("SUPERADMIN → tüm permission'lara sahiptir (bypass)", () => {
    const reflector = makeReflector(["clinic:owner:read"]);
    const guard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({
      actor: makeActor({
        actorId: "admin-1",
        role: "SUPERADMIN" as ActorRole,
        isSuperadmin: true,
        tenantId: null,
        branchId: null,
      }),
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("Branch scope mismatch → 404 VET-AUTHZ-0002 (bilgi sızdırmaz)", () => {
    const reflector = makeReflector(["clinic:appointment:read"]);
    const branchGuard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({
      actor: makeActor({
        role: "VETERINARIAN" as ActorRole,
        branchId: null,
      }),
    });
    expect(() => branchGuard.canActivate(ctx)).toThrow();
    try {
      branchGuard.canActivate(ctx);
    } catch (err) {
      const e = err as { getStatus?: () => number };
      expect(e.getStatus?.()).toBe(404);
    }
  });
});
