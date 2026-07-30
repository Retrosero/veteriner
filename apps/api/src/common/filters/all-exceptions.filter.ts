/**
 * @file Tüm exception'ları yakalayan global filter.
 * @module apps/api/common/filters/all-exceptions
 *
 * @description NestJS'in tüm exception türlerini (HttpException, ZodError,
 * DomainError, Error) yakalayarak `@vetniva/contracts` `ErrorResponse`
 * şemasına uygun JSON döner. Correlation ID her response'da bulunur.
 *
 * Tüm hata kodları `VET-<MODULE>-<NNN>` formatındadır (GOAL-004).
 *
 * HTTP durum korelasyonu:
 * - 5xx → severity=error
 * - 4xx → severity=warning
 * - diğer → severity=info
 *
 * @security Gövdeye klinik/finansal içerik yazılmaz; yalnızca sabit hata
 * kodu, güvenli mesaj ve request ID döner. PII otomatik maskelenir
 * (bkz. PII_MASKING.md).
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ZodError } from "zod";

import type { ErrorResponse, ErrorSeverity } from "@vetniva/contracts";

import { DomainError } from "../errors/domain-error.js";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const correlationId = request.requestId ?? "req-unknown";

    const { status, body } = this.toErrorResponse(exception, correlationId);

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

  private toErrorResponse(
    exception: unknown,
    correlationId: string,
  ): {
    status: number;
    body: ErrorResponse;
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
      return { status: exception.httpStatus, body };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: ErrorResponse = {
        error_code: this.codeForStatus(status),
        message: exception.message,
        source: "server",
        severity: this.severityForStatus(status),
        correlation_id: correlationId,
        timestamp: now,
      };
      return { status, body };
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
      return { status: 422, body };
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
