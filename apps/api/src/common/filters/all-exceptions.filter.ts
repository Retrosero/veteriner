/**
 * @file Tüm exception'ları yakalayan global filter.
 * @module apps/api/common/filters/all-exceptions
 * @description NestJS'in tüm exception türlerini (HttpException, ZodError,
 * DomainError, Error) yakalayarak `@vetniva/contracts` `ErrorResponse`
 * şemasına uygun JSON döner. Correlation ID her response'da bulunur.
 *
 * GOAL-100 (FAZ-10) ile birlikte bu filter aynı zamanda merkezi
 * hata olayı kayıt mekanizmasını tetikler: yakalanan her hata
 * `ErrorEventsService.recordError` üzerinden persist edilir.
 * Hata event kaydı best-effort'tur; asıl hata yanıtı her zaman
 * döner.
 *
 * Tüm hata kodları `VET-<MODULE>-<NNN>` formatındadır (GOAL-004).
 *
 * HTTP durum korelasyonu:
 * - 5xx → severity=error
 * - 4xx → severity=warning
 * - diğer → severity=info.
 * @security Gövdeye klinik/finansal içerik yazılmaz; yalnızca sabit hata
 * kodu, güvenli mesaj ve request ID döner. PII otomatik maskelenir
 * (bkz. PII_MASKING.md).
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 * @updated GOAL-100 (FAZ-10) merkezi hata olay kaydı
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Logger,
  Optional,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ZodError } from "zod";

import { ErrorEventsService } from "../../modules/error-events/error-events.service.js";
import { DomainError } from "../errors/domain-error.js";

import type {
  ErrorCode,
  ErrorResponse,
  ErrorSeverity,
} from "@vetniva/contracts";

/**
 * Filter için context — request + correlation bilgisi.
 */
interface RequestContext {
  requestId: string;
  method: string;
  url: string;
  ip: string | null;
  userAgent: string | null;
  tenantId: string | null;
  branchId: string | null;
  userId: string | null;
  actorType: "user" | "system" | "portal_user" | null;
  country: "TR" | "GB" | "SYSTEM";
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  public constructor(
    @Optional()
    @Inject(ErrorEventsService)
    private readonly errorEvents?: ErrorEventsService,
  ) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const correlationId = request.requestId ?? "req-unknown";

    const reqCtx = this.extractRequestContext(request, correlationId);
    const { status, body, errorCode, severity } = this.toErrorResponse(
      exception,
      correlationId,
    );

    // Merkezi hata olayı kaydı (best-effort). Filter'ın ana akışını
    // engellemez; hata oluşursa log'a düşer.
    if (this.errorEvents && this.shouldRecord(status, errorCode)) {
      try {
        const stack = exception instanceof Error ? exception.stack : null;
        this.errorEvents.recordError({
          requestId: correlationId,
          tenantId: reqCtx.tenantId,
          branchId: reqCtx.branchId,
          userId: reqCtx.userId,
          actorType: reqCtx.actorType ?? "system",
          module: "unknown", // service moduleFromRoute'tan türetecek
          route: `${reqCtx.method} ${reqCtx.url}`,
          release: process.env["APP_VERSION"] ?? "0.0.0-dev",
          severity,
          errorCode,
          message: body.message,
          statusCode: status,
          stack,
          context: {
            method: reqCtx.method,
            url: reqCtx.url,
            ip: reqCtx.ip,
            userAgent: reqCtx.userAgent,
            country: reqCtx.country,
            source: body.source,
            i18nKey: body.i18n_key,
          },
          country: reqCtx.country,
        });
      } catch (err) {
        this.logger.warn(
          `Merkezi hata kaydı başarısız: ${(err as Error).message}`,
        );
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} ${body.error_code}: ${body.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} → ${status} ${body.error_code}: ${body.message}`,
      );
    }

    response.status(status).json(body);
  }

  /**
   * 4xx'lerin çoğu (özellikle 401/403/404/422) client hatasıdır ve
   * kayıt altına alınmamalıdır (gürültü). 5xx + critical her zaman
   * kaydedilir. Belirli VET-AUTHZ kodları 403 olarak döndüğü için
   * burada ayrıca exclude edilir.
   * @param status
   * @param _errorCode
   */
  private shouldRecord(status: number, _errorCode: ErrorCode): boolean {
    if (status >= 500) return true;
    // 4xx'lerde yalnızca bilinçli kayıt gereken durumlar (örn. rate
    // limit) ileride eklenebilir; default: 4xx kaydetme.
    return false;
  }

  private extractRequestContext(
    request: Request & { requestId?: string },
    correlationId: string,
  ): RequestContext {
    void correlationId;
    const method = request.method ?? "UNKNOWN";
    const url = request.originalUrl ?? request.url ?? "/";
    const ip =
      (request.headers["x-forwarded-for"] as string | undefined) ??
      request.ip ??
      null;
    const userAgent = request.headers["user-agent"] ?? null;
    // Header'lar (GOAL-011 öncesi placeholder) — AuthGuard sonrası
    // session'dan taşınır. Burada yalnızca header varsa al.
    const tenantId =
      (request.headers["x-tenant-id"] as string | undefined) ?? null;
    const branchId =
      (request.headers["x-branch-id"] as string | undefined) ?? null;
    const userId =
      (request.headers["x-actor-id"] as string | undefined) ?? null;
    const roleHeader = request.headers["x-actor-role"] as string | undefined;
    const actorType: "user" | "system" | "portal_user" | null =
      roleHeader === "PET_OWNER_PORTAL"
        ? "portal_user"
        : userId
          ? "user"
          : roleHeader
            ? "user"
            : null;
    // Country adapter header'ı yoksa default TR.
    const countryHeader = request.headers["x-country"] as string | undefined;
    const country: "TR" | "GB" | "SYSTEM" =
      countryHeader === "GB"
        ? "GB"
        : countryHeader === "SYSTEM"
          ? "SYSTEM"
          : "TR";
    return {
      requestId: request.requestId ?? "req-unknown",
      method,
      url,
      ip,
      userAgent,
      tenantId,
      branchId,
      userId,
      actorType,
      country,
    };
  }

  private toErrorResponse(
    exception: unknown,
    correlationId: string,
  ): {
    status: number;
    body: ErrorResponse;
    errorCode: ErrorCode;
    severity: ErrorSeverity;
  } {
    const now = new Date().toISOString();

    if (exception instanceof DomainError) {
      const body: ErrorResponse = {
        error_code: exception.errorCode,
        message: exception.message,
        source: "server",
        severity: exception.severity,
        correlation_id: correlationId,
        timestamp: now,
        ...(exception.i18nKey ? { i18n_key: exception.i18nKey } : {}),
        ...(exception.details ? { details: exception.details } : {}),
        ...(exception.actionUrl ? { action_url: exception.actionUrl } : {}),
      };
      return {
        status: exception.httpStatus,
        body,
        errorCode: exception.errorCode,
        severity: exception.severity,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const errorCode = this.codeForStatus(status);
      const body: ErrorResponse = {
        error_code: errorCode,
        message: exception.message,
        source: "server",
        severity: this.severityForStatus(status),
        correlation_id: correlationId,
        timestamp: now,
      };
      return {
        status,
        body,
        errorCode,
        severity: this.severityForStatus(status),
      };
    }

    if (exception instanceof ZodError) {
      const body: ErrorResponse = {
        error_code: "VET-VALIDATION-0001",
        message: "Form doğrulaması başarısız",
        source: "server",
        severity: "warning",
        correlation_id: correlationId,
        timestamp: now,
        details: { issues: exception.issues },
        i18n_key: "error.VET-VALIDATION-0001",
      };
      return {
        status: 422,
        body,
        errorCode: "VET-VALIDATION-0001",
        severity: "warning",
      };
    }

    return {
      status: 500,
      body: {
        error_code: "VET-COMMON-0001",
        message: "Beklenmeyen sunucu hatası",
        source: "server",
        severity: "error",
        correlation_id: correlationId,
        timestamp: now,
        i18n_key: "error.VET-COMMON-0001",
      },
      errorCode: "VET-COMMON-0001",
      severity: "error",
    };
  }

  private severityForStatus(status: number): ErrorSeverity {
    if (status >= 500) return "error";
    if (status >= 400) return "warning";
    return "info";
  }

  private codeForStatus(status: number): ErrorResponse["error_code"] {
    if (status === 401) return "VET-AUTH-0001";
    if (status === 403) return "VET-AUTHZ-0001";
    if (status === 404) return "VET-AUTHZ-0001"; // bilgi sızdırmaz
    if (status === 422) return "VET-VALIDATION-0001";
    if (status === 429) return "VET-COMMON-0004";
    if (status === 502) return "VET-INTEGRATION-0001";
    if (status === 503) return "VET-COMMON-0002";
    if (status === 504) return "VET-COMMON-0003";
    if (status >= 500) return "VET-COMMON-0001";
    return "VET-COMMON-0001";
  }
}
