/**
 * @file ActorContextService unit testleri.
 * @module apps/api/common/actor/actor-context.service.spec
 *
 * @description Header extraction, default placeholder ve SYSTEM
 * actor üretimi testleri.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActorContextService } from "./actor-context.service.js";

describe("ActorContextService", () => {
  let service: ActorContextService;

  beforeEach(() => {
    vi.unstubAllEnvs();
    service = new ActorContextService();
  });

  function makeReq(headers: Record<string, string | undefined>) {
    return {
      header: (name: string): string | undefined => {
        const key = name.toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === key) return v;
        }
        return undefined;
      },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    };
  }

  it("header varsa onu kullanır (source: header)", () => {
    const req = makeReq({
      "x-actor-id": "usr-1",
      "x-actor-role": "SUPERADMIN",
      "x-tenant-id": "tnt-1",
    });
    const actor = service.fromRequest(req, "req-1");
    expect(actor.actorId).toBe("usr-1");
    expect(actor.role).toBe("SUPERADMIN");
    expect(actor.tenantId).toBe("tnt-1");
    expect(actor.source).toBe("header");
  });

  it("header yoksa development'ta default STAFF actor üretir", () => {
    vi.stubEnv("NODE_ENV", "development");
    const req = makeReq({});
    const actor = service.fromRequest(req, "req-1");
    expect(actor.role).toBe("STAFF");
    expect(actor.source).toBe("default");
  });

  it("production'da header yoksa hata fırlatır", () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = makeReq({});
    expect(() => service.fromRequest(req, "req-1")).toThrow();
  });

  it("system() SYSTEM actor üretir", () => {
    const actor = service.system("req-x");
    expect(actor.actorType).toBe("system");
    expect(actor.actorId).toBeNull();
    expect(actor.role).toBe("SYSTEM");
    expect(actor.source).toBe("system");
  });

  it("IP mask'lenir (son oktet ***)", () => {
    const req = makeReq({
      "x-forwarded-for": "192.168.1.42, 10.0.0.1",
    });
    const actor = service.fromRequest(req, "req-1");
    expect(actor.ipAddress).toBe("192.168.1.***");
  });
});
