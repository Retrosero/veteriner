/**
 * @file Actor interceptor.
 * @module apps/api/common/actor/actor.interceptor
 * @description Her istek için actor bilgisini çıkarır ve request'e
 * iliştirir. `ActorContextService.fromRequest` çağrısı yapar; üretilen
 * `ActorContext` `request.actor` üzerinde taşınır. Controller'lar
 * `@CurrentActor()` dekoratörü ile bu bilgiye erişir.
 *
 * Bu interceptor, RequestIdInterceptor'dan SONRA çalışmalıdır
 * (correlationId önce set edilir).
 * Güvenlik: AuthGuard çalışan endpoint'lerde önce session kökenli actor
 * oluşturulur. Header fallback yalnızca geriye dönük/dev-test uyumluluğu
 * içindir; production endpoint'leri AuthGuard ile korunmalıdır.
 * GOAL-010 (Faz 1) tenant ve şube altyapısının parçasıdır.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { Observable } from "rxjs";

import { ActorContextService } from "./actor-context.service.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";

import type { ActorContext } from "./actor-context.service.js";

declare module "express-serve-static-core" {
  interface Request {
    actor?: ActorContext;
  }
}

@Injectable()
export class ActorInterceptor implements NestInterceptor {
  public constructor(
    private readonly actorService: ActorContextService,
    private readonly reflector: Reflector,
  ) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Public endpoint'lerde zorunlu actor çıkarımı yapılmaz. AuthGuard bu
    // metadata'yı zaten atladığından, interceptor'ın production header
    // fallback'i health/login gibi açık route'ları yeniden 401'e çeviremez.
    if (isPublic) {
      return next.handle();
    }

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
