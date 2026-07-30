/**
 * @file Audit service (Prisma genişletmesi).
 * @module apps/api/common/audit/audit.service
 *
 * @description Audit event'leri toplar, PII maskeler, log + DB'ye yazar.
 * GOAL-010 ile birlikte Prisma `AuditEvent` tablosuna da yazım eklenmiştir
 * (append-only). DB yazımı best-effort: hata durumunda log'a düşer,
 * uygulama akışı engellenmez. GOAL-100+ ile batch insert queue'suna
 * alınacak.
 *
 * Davranış:
 * - Pino logger üzerinden yapısal log (her zaman).
 * - Prisma AuditEvent.create (best-effort, await edilir).
 * - Critical event'ler için console.error (gerçek üretimde PagerDuty).
 *
 * @security PII maskeleme zorunlu. before/after alanları
 *   PiiMasker üzerinden geçmeden yazılmaz. DB trigger'ı UPDATE/DELETE'i
 *   engeller (append-only).
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 * @updated GOAL-010 (FAZ-1) Prisma AuditEvent yazımı eklendi
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service.js";
import { PiiMasker } from "../logging/pii-masker.js";
import type {
  AuditEvent,
  AuditEventInput,
  AuditSeverity,
} from "./audit.types.js";

/**
 * AuditService. Audit event'leri kabul eder, zenginleştirir, mask'ler
 * ve hem log hem DB'ye yazar.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly masker = new PiiMasker();

  public constructor(private readonly prisma: PrismaService) {}

  /**
   * Event'i log + DB'ye yazar. DB yazımı başarısız olursa log'a
   * hata düşer; çağırıcı engellenmez.
   */
  public async record(input: AuditEventInput): Promise<AuditEvent> {
    const event: AuditEvent = {
      ...input,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    // PII mask'leme (before/after/diff).
    const before = this.maskPayload(event.before);
    const after = this.maskPayload(event.after);
    const diff = this.maskPayload(event.diff);
    const metadata = this.maskPayload(event.metadata);

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
      before,
      after,
      diff,
      ip_address: event.ipAddress,
      user_agent_hash: event.userAgentHash,
      metadata,
    };

    this.logBySeverity(event.severity, payload);

    if (event.severity === "critical") {
      // Gerçek üretimde PagerDuty / Slack alert tetikler.
      this.logger.error(
        `CRITICAL AUDIT EVENT: ${event.eventName} target=${event.targetType}:${event.targetId}`,
      );
    }

    // Best-effort DB yazımı. Hata durumunda log'a düşer.
    try {
      await this.prisma.auditEvent.create({
        data: {
          id: event.eventId,
          eventName: event.eventName,
          tenantId: event.tenantId ?? null,
          branchId: event.branchId ?? null,
          actorId: event.actorId ?? null,
          actorType: event.actorType,
          targetType: event.targetType,
          targetId: event.targetId,
          action: event.action,
          before: (before as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
          after: (after as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
          diff: (diff as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
          correlationId: event.correlationId,
          ipAddress: event.ipAddress ?? null,
          userAgentHash: event.userAgentHash ?? null,
          country: event.country,
          severity: event.severity,
          metadata: (metadata as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
        },
      });
    } catch (err) {
      this.logger.error(
        `Audit DB yazımı başarısız: ${event.eventName} target=${event.targetType}:${event.targetId}`,
        err instanceof Error ? err.stack : String(err),
      );
      // Hata swallow: log her zaman yazıldı; operasyonu engelleme.
    }

    return event;
  }

  /**
   * Severity'ye göre uygun log metodunu çağırır.
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
   * PII payload'ı mask'ler. Null/undefined korunur.
   */
  private maskPayload(
    payload: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (payload === null || payload === undefined) return null;
    return this.masker.mask(payload) as Record<string, unknown>;
  }

  /**
   * Basit helper: sadece event ismi ve target bilgisi ile
   * event oluşturur. Actor bilgisi dışarıdan verilir.
   */
  public async recordSimple(
    eventName: string,
    targetType: string,
    targetId: string,
    action: AuditEventInput["action"],
    actor: {
      actorId: string | null;
      actorType: AuditEventInput["actorType"];
      tenantId: string | null;
      branchId?: string | null;
      correlationId: string;
      country: string;
      ipAddress?: string | null;
      userAgentHash?: string | null;
    },
    severity: AuditSeverity = "info",
    metadata?: Record<string, unknown>,
  ): Promise<AuditEvent> {
    return this.record({
      eventName,
      tenantId: actor.tenantId,
      branchId: actor.branchId ?? null,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType,
      targetId,
      action,
      correlationId: actor.correlationId,
      country: actor.country,
      severity,
      ipAddress: actor.ipAddress ?? null,
      userAgentHash: actor.userAgentHash ?? null,
      metadata: metadata ?? null,
    });
  }
}
