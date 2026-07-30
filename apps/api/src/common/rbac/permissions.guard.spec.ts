/**
 * @file PermissionsGuard unit testleri.
 * @module apps/api/common/rbac/permissions.guard.spec
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { PermissionsGuard } from "./permissions.guard.js";
import { PERMISSIONS_KEY } from "./require-permission.decorator.js";
import { RbacService } from "./rbac.service.js";
import { RbacRepository } from "./rbac.repository.js";
import {
  resetPermissionCatalogCache,
  loadPermissionCatalog,
} from "./permission-catalog.loader.js";

function makeContext(args: {
  handlerMetadata?: unknown;
  classMetadata?: unknown;
  actor?: unknown;
}): ExecutionContext {
  return {
    getHandler: () =>
      (() => undefined) as unknown as ExecutionContext["getHandler"] extends () => infer H
        ? H
        : never,
    getClass: () =>
      (() => undefined) as unknown as ExecutionContext["getClass"] extends () => infer C
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

function makeReflector(
  handlerMetadata: unknown,
  classMetadata: unknown,
): Reflector {
  const r = new Reflector();
  // Vitest'te Reflector.getAllAndOverride'un imzası farklılık
  // gösterebilir; tip uyumu için any cast uygulanır.
  vi.spyOn(r, "getAllAndOverride").mockImplementation(((
    key: string,
    _targets: unknown[],
  ): unknown => {
    if (key === PERMISSIONS_KEY) {
      return handlerMetadata ?? classMetadata;
    }
    return undefined;
  }) as never);
  return r;
}

describe("PermissionsGuard", () => {
  let audit: AuditService;
  let rbac: RbacService;
  let guard: PermissionsGuard;

  beforeEach(() => {
    resetPermissionCatalogCache();
    loadPermissionCatalog();
    audit = {
      recordSimple: vi.fn().mockResolvedValue({}),
      record: vi.fn().mockResolvedValue({}),
    } as unknown as AuditService;
    rbac = new RbacService(audit, {} as RbacRepository);
  });

  it("metadata yoksa guard bypass (izin var)", async () => {
    const reflector = makeReflector(undefined, undefined);
    guard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({});
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
  });

  it("aktor yoksa 401 fırlatır", async () => {
    const reflector = makeReflector(["branch:branch:read"], undefined);
    guard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it("aktor permission'a sahipse izin verir", async () => {
    const reflector = makeReflector(["branch:branch:read"], undefined);
    guard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({
      actor: {
        actorId: "user-1",
        actorType: "user",
        role: "OWNER",
        tenantId: "tnt-1",
        branchId: "branch-1",
        isSuperadmin: false,
      },
    });
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
  });

  it("aktor permission'a sahip değilse ForbiddenException fırlatır", async () => {
    const reflector = makeReflector(["branch:branch:create"], undefined);
    guard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({
      actor: {
        actorId: "user-1",
        actorType: "user",
        role: "STAFF",
        tenantId: "tnt-1",
        branchId: "branch-1",
        isSuperadmin: false,
      },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });

  it("SUPERADMIN tüm permission'lara sahiptir", async () => {
    const reflector = makeReflector(["branch:branch:create"], undefined);
    guard = new PermissionsGuard(reflector, rbac);
    const ctx = makeContext({
      actor: {
        actorId: "admin-1",
        actorType: "user",
        role: "SUPERADMIN",
        tenantId: null,
        branchId: null,
        isSuperadmin: true,
      },
    });
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
  });
});
