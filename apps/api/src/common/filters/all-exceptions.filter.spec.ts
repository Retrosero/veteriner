/**
 * @file Global exception filter actor bağlamı testleri.
 * @module apps/api/common/filters/all-exceptions.filter.spec
 * @description Hata olaylarının tenant ve kullanıcı bilgisini HTTP
 * başlıklarından değil, AuthGuard tarafından doğrulanmış `request.actor`
 * bağlamından aldığını doğrular.
 * @security İstemci kontrollü x-tenant-id ve x-actor-* başlıklarının hata
 * merkezi kayıtlarını zehirlemesi tenant izolasyonu ihlaline yol açmamalıdır.
 */

import { describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";

import type { ErrorEventsService } from "../../modules/error-events/error-events.service.js";
import type { ActorContext } from "../actor/actor-context.service.js";
import type { ArgumentsHost } from "@nestjs/common";
import type { Request, Response } from "express";

describe("AllExceptionsFilter", () => {
  it("hata olayında spoof edilmiş header yerine doğrulanmış actor kullanır", () => {
    const recordError = vi.fn();
    const filter = new AllExceptionsFilter({
      recordError,
    } as unknown as ErrorEventsService);
    const actor: ActorContext = {
      actorId: "11111111-1111-1111-1111-111111111111",
      actorType: "user",
      role: "STAFF",
      tenantId: "22222222-2222-2222-2222-222222222222",
      branchId: "33333333-3333-3333-3333-333333333333",
      isSuperadmin: false,
      correlationId: "req-test",
      ipAddress: null,
      userAgentHash: null,
      source: "session",
    };
    const request = {
      requestId: "req-test",
      method: "GET",
      url: "/api/v1/patient/1",
      originalUrl: "/api/v1/patient/1",
      ip: "127.0.0.1",
      actor,
      headers: {
        "x-tenant-id": "attacker-tenant",
        "x-branch-id": "attacker-branch",
        "x-actor-id": "attacker-user",
        "x-actor-role": "SUPERADMIN",
      },
    } as unknown as Request;
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: <T>() => request as T,
        getResponse: <T>() => response as T,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new Error("beklenmeyen hata"), host);

    expect(recordError).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        userId: actor.actorId,
        actorType: actor.actorType,
      }),
    );
  });
});
