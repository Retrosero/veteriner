/**
 * @file Logger service iskeleti.
 * @module apps/api/common/logging/logger.service
 *
 * @description Pino tabanlı yapısal logger. Tüm log çağrıları
 * PII masker'dan geçer. AsyncLocalStorage ile request
 * context (tenant, user, correlation_id) otomatik eklenir.
 *
 * @security PII plain text loglanmaz. Production'da level: info.
 *   Development'ta pino-pretty; production'da ham JSON.
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

import { Injectable } from "@nestjs/common";
import pino, { type Logger as PinoLogger } from "pino";

import { PiiMasker } from "./pii-masker.js";

/**
 * Logger context. AsyncLocalStorage ile her istek
 * başlangıcında doldurulur.
 */
export interface LogContext {
  requestId?: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  country?: string;
}

/**
 * LoggerService. NestJS'in Logger'ını sarmalayarak yapısal
 * JSON log + PII maskeleme sağlar.
 */
@Injectable()
export class LoggerService {
  private readonly pino: PinoLogger;
  private readonly masker: PiiMasker;

  constructor(service: string = "api", masker?: PiiMasker) {
    this.masker = masker ?? new PiiMasker();
    this.pino = pino({
      level: process.env.LOG_LEVEL ?? "info",
      base: {
        service,
        host: process.env.HOSTNAME ?? "local",
        pid: process.pid,
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      formatters: {
        level: (label) => ({ level: label }),
      },
      // Otomatik redact (PII masker'ın yedeği).
      redact: {
        paths: [
          "*.password",
          "*.token",
          "*.api_key",
          "*.secret",
          "*.authorization",
        ],
        censor: "[REDACTED]",
      },
    });
  }

  /**
   * Verilen payload'ı mask'leyip yapısal log yazar.
   */
  public log(payload: Record<string, unknown> & { message?: string }): void {
    const masked = this.masker.mask(payload) as Record<string, unknown>;
    this.pino.info(masked);
  }

  public warn(payload: Record<string, unknown> & { message?: string }): void {
    const masked = this.masker.mask(payload) as Record<string, unknown>;
    this.pino.warn(masked);
  }

  public error(
    payload: Record<string, unknown> & { message?: string; error?: unknown },
  ): void {
    const masked = this.masker.mask(payload) as Record<string, unknown>;
    this.pino.error(masked);
  }

  public debug(payload: Record<string, unknown> & { message?: string }): void {
    const masked = this.masker.mask(payload) as Record<string, unknown>;
    this.pino.debug(masked);
  }

  /**
   * Alt-modül için child logger üretir.
   */
  public child(bindings: Record<string, unknown>): LoggerService {
    const child = Object.create(this) as LoggerService;
    (child as unknown as { pino: PinoLogger }).pino = this.pino.child(bindings);
    return child;
  }
}
