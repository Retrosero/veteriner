/**
 * @file Actor interceptor.
 * @module apps/api/common/actor/actor.interceptor
 *
 * @description Her istek için actor bilgisini çıkarır ve request'e
 * iliştirir. `ActorContextService.fromRequest` çağrısı yapar; üretilen
 * `ActorContext` `request.actor` üzerinde taşınır. Controller'lar
 * `@CurrentActor()` dekoratörü ile bu bilgiye erişir.
 *
 * Bu interceptor, RequestIdInterceptor'dan SONRA çalışmalıdır
 * (correlationId önce set edilir).
 *
 * @security Actor bilgisi header'lardan alındığı için GOAL-010
 *   kapsamında spoofing'e açıktır. GOAL-011 sonrası bu interceptor
 *   gerçek auth guard ile değiştirilecek.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { Request } from "express";

import type { ActorContext } from "./actor-context.service.js";
import { ActorContextService } from "./actor-context.service.js";

declare module "express-serve-static-core" {
  interface Request {
    actor?: ActorContext;
  }
}

@Injectable()
export class ActorInterceptor implements NestInterceptor {
  public constructor(private readonly actorService: ActorContextService) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const correlationId = request.requestId ?? "req-unknown";
    // GOAL-011: AuthGuard daha önce çalıştıysa request.actor zaten
    // session-tabanlı set edilmiştir; header fallback'e düşmeyiz.
    if (request.actor) {
      return next.handle();
    }
    const req: {
      header(name: string): string | undefined;
      ip?: string;
      socket?: { remoteAddress?: string };
    } = {
      header: (name: string): string | undefined => request.header(name),
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
      ...(request.socket?.remoteAddress !== undefined
        ? { socket: { remoteAddress: request.socket.remoteAddress } }
        : {}),
    };
    const actor = this.actorService.fromRequest(req, correlationId);
    request.actor = actor;
    return next.handle();
  }
}
