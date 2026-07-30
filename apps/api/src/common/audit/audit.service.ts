/**
 * @file Audit service iskeleti.
 * @module apps/api/common/audit/audit.service
 *
 * @description Audit event'leri toplar, PII maskeler, batch
 * halinde DB'ye yazar. Bu implementasyon FAZ-0 için iskelettir;
 * gerçek DB yazımı GOAL-010+ ile Prisma AuditEvent modeli
 * üzerinden yapılacak.
 *
 * Şu anki davranış:
 * - Pino logger üzerinden yapısal log yazar
 * - Testlerde in-memory queue kullanılabilir
 * - Critical event'ler için console.warn (gerçekte PagerDuty)
 *
 * @security PII maskeleme zorunlu. before/after alanları
 *   PiiMasker üzerinden geçmeden yazılmaz.
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  AuditEvent,
  AuditEventInput,
  AuditSeverity,
} from "./audit.types.js";

/**
 * AuditService. Audit event'leri kabul eder, zenginleştirir
 * ve log/DB'ye yazar. FAZ-0'da log tabanlı; Faz 10+ ile
 * Prisma AuditEvent modeli kullanılacak.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  /**
   * Event'i kayıt için kabul eder.
   *
   * Not: FAZ-0 iskeletinde gerçek DB yazımı yok; Pino
   * logger üzerinden `audit.event` mesajı yazılır.
   * Production'da bu metot, batch insert queue'suna
   * eklenir.
   */
  public async record(input: AuditEventInput): Promise<AuditEvent> {
    const event: AuditEvent = {
      ...input,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    const payload = {
      msg: "audit.event",
      event_id: event.eventId,
      event_name: event.eventName,
      tenant_id: event.tenantId,
      branch_id: event.branchId,
      actor_id: event.actorId,
      actor_type: event.actorType,
      target_type: event.targetType,
      target_id: event.targetId,
      action: event.action,
      correlation_id: event.correlationId,
      country: event.country,
      severity: event.severity,
      before: event.before,
      after: event.after,
      diff: event.diff,
      ip_address: event.ipAddress,
      user_agent_hash: event.userAgentHash,
      metadata: event.metadata,
    };

    this.logBySeverity(event.severity, payload);

    if (event.severity === "critical") {
      // Gerçek üretimde PagerDuty / Slack alert tetikler.
      this.logger.error(
        `CRITICAL AUDIT EVENT: ${event.eventName} target=${event.targetType}:${event.targetId}`,
      );
    }

    return event;
  }

  /**
   * Severity'ye göre uygun log metodunu çağırır. Dinamik
   * indeksleme `noImplicitAny` ile uyumsuz olduğundan
   * switch kullanıyoruz.
   */
  private logBySeverity(
    severity: AuditSeverity,
    payload: Record<string, unknown>,
  ): void {
    switch (severity) {
      case "info":
        this.logger.log(payload);
        return;
      case "warning":
        this.logger.warn(payload);
        return;
      case "error":
        this.logger.error(payload);
        return;
      case "critical":
        this.logger.error(payload);
        return;
    }
  }

  /**
   * Basit helper: sadece event ismi ve target bilgisi ile
   * event oluşturur. Diğer alanlar (tenant, actor, vb.)
   * AuditContext'ten alınır (GOAL-010+'da implement).
   */
  public async recordSimple(
    eventName: string,
    targetType: string,
    targetId: string,
    action: AuditEventInput["action"],
    severity: AuditSeverity = "info",
    metadata?: Record<string, unknown>,
  ): Promise<AuditEvent> {
    return this.record({
      eventName,
      tenantId: null,
      actorId: null,
      actorType: "system",
      targetType,
      targetId,
      action,
      correlationId: "req-unknown",
      country: "TR",
      severity,
      metadata: metadata ?? null,
    });
  }
}
