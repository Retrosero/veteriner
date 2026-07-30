/**
 * @file Bildirim modülü service.
 * @module apps/api/modules/notifications/notifications.service
 *
 * @description Bildirim gönderim akışının orkestratörü. Adımlar:
 * 1. Idempotency kontrolü (aynı key ile tekrar istek → mevcut recordId).
 * 2. Consent kontrolü (yoksa `opted_out` + audit warning).
 * 3. Cross-tenant doğrulama (actor.tenantId !== request.tenantId → hata).
 * 4. Template render (locale'e göre).
 * 5. Provider çözümleme (channel'a göre DI).
 * 6. Queue'ya ekleme + senkron `processAll`.
 * 7. Audit (`audit:notification.send`).
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  NotificationCategory,
  NotificationChannel,
  NotificationLocale,
  NotificationRequest,
  NotificationStatus,
} from "@vetniva/contracts";

import { ActorContext } from "../../common/actor/actor-context.service.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { ConsentService } from "../../common/notifications/consent.service.js";
import { IdempotencyService } from "../../common/notifications/idempotency.service.js";
import {
  NotificationQueue,
  QueueProcessOutcome,
} from "../../common/notifications/queue.js";
import { TemplateService } from "../../common/notifications/template.service.js";
import type {
  InboxItem,
  NotificationRecord,
} from "../../common/notifications/notification.types.js";
import { InboxStore } from "../../common/notifications/providers/in-app.provider.js";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  public constructor(
    private readonly templates: TemplateService,
    private readonly consent: ConsentService,
    private readonly idempotency: IdempotencyService,
    private readonly queue: NotificationQueue,
    private readonly inboxStore: InboxStore,
    private readonly audit: AuditService,
  ) {}

  /**
   * Tek bir bildirim isteğini işler. Idempotent: aynı
   * `idempotencyKey` ile ikinci çağrı mevcut record'u döner.
   *
   * @param request NotificationRequest
   * @param actor Opsiyonel aktör bağlamı (cross-tenant doğrulama için)
   */
  public async send(
    request: NotificationRequest,
    actor?: ActorContext,
  ): Promise<NotificationRecord> {
    // 1. Idempotency kontrolü.
    if (request.idempotencyKey) {
      const existing = this.idempotency.wasSent(request.idempotencyKey);
      if (existing) {
        return this.lookupRecord(existing.recordId) ?? this.buildOptedOutRecord(request);
      }
    }

    // 2. Cross-tenant doğrulama.
    if (actor && actor.tenantId && actor.tenantId !== request.tenantId) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Cross-tenant erişim denemesi",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-AUTHZ-0002",
      });
    }

    // 3. Consent kontrolü.
    if (
      !this.consent.canSend(request.userId, request.channel, request.category)
    ) {
      const record = this.buildRecord(request, "opted_out", 0, {
        lastError: "user opted out",
      });
      await this.recordAudit(request, actor, "opted_out", "warning");
      return record;
    }

    // 4. Template render.
    const rendered = this.templates.renderOrFallback(
      request.templateKey,
      request.category,
      request.locale,
      request.data,
    );

    // 5. Provider seçimi + queue.
    const record = this.buildRecord(request, "queued", 0);
    if (request.idempotencyKey) {
      this.idempotency.markSent(request.idempotencyKey, record.id);
    }

    // In-app provider'ı userId + category + templateKey ile beslemek
    // için payload'u genişletiyoruz (in-app provider kendi store'una
    // yazıyor). exactOptional uyumlu kurulum.
    const enrichedPayload = {
      to: this.resolveRecipient(request),
      ...(rendered.subject !== undefined ? { subject: rendered.subject } : {}),
      body: rendered.body,
      locale: request.locale,
      userId: request.userId,
      category: request.category,
      templateKey: request.templateKey,
    };

    this.queue.enqueue({
      recordId: record.id,
      channel: request.channel,
      payload: enrichedPayload as Parameters<typeof this.queue.enqueue>[0]["payload"],
    });

    // 6. Senkron processAll (FAZ-0). Faz 11+'da worker async yapar.
    // Retry durumda kalan item'lar için backoff süresi beklenmeden
    // (FAZ-0 in-process queue) tüm retry'lar tamamlanana kadar
    // processAll tekrar çağrılır. Sonsuz loop koruması için üst
    // sınır uygulanır. Aynı recordId için birden fazla outcome
    // olabilir (retrying → failed); en güncel (son) outcome alınır.
    const outcomes = await this.dispatchAll();
    const sameRecord = outcomes.filter((o) => o.recordId === record.id);
    const own = sameRecord.length > 0 ? sameRecord[sameRecord.length - 1] : undefined;
    const finalRecord = this.applyOutcome(record, own);

    // 7. Audit.
    const severity = this.auditSeverityFor(finalRecord.status);
    await this.recordAudit(request, actor, finalRecord.status, severity, finalRecord);

    return finalRecord;
  }

  /**
   * Kullanıcının in-app inbox'ını döner. Tenant filtresi zorunlu.
   */
  public async inbox(
    userId: string,
    tenantId: string,
    actor?: ActorContext,
  ): Promise<InboxItem[]> {
    if (actor && actor.tenantId && actor.tenantId !== tenantId) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Cross-tenant erişim denemesi",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-AUTHZ-0002",
      });
    }
    return this.inboxStore.list(userId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildRecord(
    request: NotificationRequest,
    status: NotificationStatus,
    attempts: number,
    extras: { lastError?: string; sentAt?: string } = {},
  ): NotificationRecord {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      tenantId: request.tenantId,
      userId: request.userId,
      channel: request.channel,
      category: request.category,
      templateKey: request.templateKey,
      status,
      attempts,
      createdAt: now,
      ...(extras.lastError ? { lastError: extras.lastError } : {}),
      ...(extras.sentAt ? { sentAt: extras.sentAt } : {}),
    };
  }

  private buildOptedOutRecord(request: NotificationRequest): NotificationRecord {
    return this.buildRecord(request, "opted_out", 0, {
      lastError: "user opted out (idempotency hit)",
    });
  }

  private applyOutcome(
    record: NotificationRecord,
    outcome: QueueProcessOutcome | undefined,
  ): NotificationRecord {
    if (!outcome) return record;
    if (outcome.status === "sent") {
      return {
        ...record,
        status: "sent",
        attempts: outcome.attempts,
        sentAt: new Date().toISOString(),
      };
    }
    if (outcome.status === "failed") {
      return {
        ...record,
        status: "failed",
        attempts: outcome.attempts,
        lastError: outcome.error ?? "unknown",
      };
    }
    // retrying — şimdilik status sending olarak güncellenir.
    return {
      ...record,
      status: "sending",
      attempts: outcome.attempts,
    };
  }

  private resolveRecipient(_request: NotificationRequest): string {
    // FAZ-0: provider stub'ları alıcıya erişmez. Faz 11+'da user
    // lookup ile email/phone çözümlenir.
    return "stub-recipient";
  }

  /**
   * FAZ-0 queue dispatch helper'ı. Tüm retry'lar tamamlanana kadar
   * (ya da güvenlik sınırına ulaşılana kadar) queue.processAll'u
   * çağırır. Faz 11+'da BullMQ worker'ı bu döngünün yerini alır.
   *
   * FAZ-0'da in-process queue olduğu için gerçek zaman beklemesi
   * yok; her iterasyonda `now` bilinçli olarak 1 saniye ileri
   * taşınır. Bu, MAX_ATTEMPTS × BACKOFF_FACTOR üst sınırını (450ms)
   * aşarak retry'ların aynı processAll çağrısı içinde işlenmesini
   * sağlar. Faz 11+'da BullMQ scheduled retry semantiği bu
   * helper'ın yerini alır.
   */
  private async dispatchAll(): Promise<QueueProcessOutcome[]> {
    const all: QueueProcessOutcome[] = [];
    const maxIterations = 10; // MAX_ATTEMPTS * üst sınır güvenliği
    let now = Date.now();
    for (let i = 0; i < maxIterations; i += 1) {
      now += 1000; // backoff üst sınırı (450ms) aşacak kadar
      const outcomes = await this.queue.processAll(now);
      all.push(...outcomes);
      const stillRetrying = outcomes.some((o) => o.status === "retrying");
      if (!stillRetrying) break;
    }
    return all;
  }

  private async recordAudit(
    request: NotificationRequest,
    actor: ActorContext | undefined,
    status: NotificationStatus,
    severity: "info" | "warning",
    record?: NotificationRecord,
  ): Promise<void> {
    await this.audit.record({
      eventName: "audit:notification.send",
      tenantId: request.tenantId,
      branchId: actor?.branchId ?? null,
      actorId: actor?.actorId ?? null,
      actorType: actor?.actorType ?? "system",
      targetType: "notification",
      targetId: record?.id ?? "pending",
      action: "send",
      correlationId: actor?.correlationId ?? "sys-no-correlation",
      country: "TR",
      severity,
      metadata: {
        channel: request.channel,
        category: request.category,
        templateKey: request.templateKey,
        status,
        attempts: record?.attempts ?? 0,
      },
    });
  }

  private auditSeverityFor(status: NotificationStatus): "info" | "warning" {
    switch (status) {
      case "sent":
      case "queued":
        return "info";
      case "failed":
      case "bounced":
      case "opted_out":
        return "warning";
      case "sending":
        return "info";
      default:
        return "info";
    }
  }

  /**
   * Idempotency hit durumunda, queue'da olmayan eski record'u
   * yeniden inşa etmek için placeholder. FAZ-0: yeni opted_out
   * kaydı döner (idempotency recordId'si kaybolduğunda zararsız
   * varsayılan). Faz 11+'da DB lookup yapılır.
   */
  private lookupRecord(_recordId: string): NotificationRecord | null {
    return null;
  }
}
