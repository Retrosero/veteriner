/**
 * @file Request ID interceptor.
 * @module apps/api/common/interceptors/request-id
 * @description Her isteğe bir correlation/request ID atar. İstemci
 * `X-Request-Id` başlığı gönderdiyse onu kullanır; aksi halde yeni
 * UUID üretir. Response header'ına yazılır. Logger ve audit altyapısı
 * bu ID ile ilişkilendirme yapar.
 * @security ID formatı UUID v4; tahmin edilemez. Tek bir request
 * akışında sabit kalır; background job'lar için jobId ayrıca üretilir.
 */

import { randomUUID } from "node:crypto";

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Observable } from "rxjs";

export const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();

    const incoming = request.header(REQUEST_ID_HEADER);
    const requestId =
      incoming && incoming.length > 0 && incoming.length <= 128
        ? incoming
        : randomUUID();

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    return next.handle();
  }
}
