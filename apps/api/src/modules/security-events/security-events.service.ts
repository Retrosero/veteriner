/**
 * @file SecurityEvent service.
 * @module apps/api/modules/security-events/security-events.service
 *
 * @description GOAL-105 (FAZ-10) güvenlik logları ve alarm
 * kuralları iş kuralları.
 *
 * - `recordSecurityEvent`: Auth guard, RBAC guard, tenant guard
 *   ve dış katmanlardan çağrılır. Fingerprint (type + module +
 *   normalizeMessage) üretir; aynı fingerprint için mevcut kayıt
 *   varsa occurrenceCount artırılır. Severity=critical olduğunda
 *   ve alertSent=false ise alarm adapter tetiklenir.
 * - `listSecurityEvents`: SUPERADMIN paneli için filtreli arama.
 * - `getSecurityEventDetail`: tek kayıt detayı.
 * - `getSecurityEventSummary`: type × severity bazlı aggregate
 *   özet + top saldırı sınıfları (fingerprint bazlı).
 * - `recordClientSecurityEvent`: frontend tarafından gönderilen
 *   güvenlik raporları (kabul eden: System namespace, auth
 *   placeholder).
 *
 * Alarm adapter'i `SecurityAlertAdapter` arayüzü üzerinden pluggable;
 * default `NoopSecurityAlertAdapter` yalnızca loglar. Production'da
 * `Slack/PagerDuty/Email` adapter'leri sonradan bağlanabilir.
 *
 * @security Tenant filtresi opsiyonel; SUPERADMIN cross-tenant
 *   görür. Ancak PII zaten mask'lı gelir; ek bir sanitization
 *   gerekmez. `ipAddress` `192.168.1.***` formatında saklanır.
 *   Alarm adapter çağrısı best-effort'tur; başarısız olursa
 *   `alertSent=false` korunur ve log'a düşer.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */

import { createHash } from "node:crypto";

import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

import { SecurityEventsRepository } from "./security-events.repository.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PiiMasker } from "../../common/logging/pii-masker.js";
import {
  toSecurityEvent,
  type SecurityEventRecord,
} from "../../common/security-events/security-event.types.js";
import { moduleFromRoute as errorModuleFromRoute } from "../error-events/error-events.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  ClientSecurityEventInput,
  ClientSecurityEventResponse,
  ErrorCode,
  SecurityEvent,
  SecurityEventCreateInput,
  SecurityEventFilters,
  SecurityEventGroup,
  SecurityEventListResponse,
  SecurityEventModule,
  SecurityEventSeverity,
  SecurityEventSummary,
  SecurityEventSummaryQuery,
} from "@vetniva/contracts";

/** Uygulama sürümü. `APP_VERSION` env ya da sabit. */
const APP_RELEASE = process.env["APP_VERSION"] ?? "0.0.0-dev";

/* --------------------------------------------------------------------------
 * Alarm adapter arayüzü
 * --------------------------------------------------------------------------
 */

/**
 * Güvenlik alarm adapter sözleşmesi. Birden fazla adapter
 * (Slack/PagerDuty/Email) aynı interface'i implemente eder;
 * `recordSecurityEvent` kritik olayda ilk adapter'i çağırır
 * (default: Noop). Adapter başarısız olursa hata fırlatmaz,
 * yalnızca `success=false` döner; service log'a düşer ve
 * `alertSent=false` korunur.
 */
export interface SecurityAlertAdapter {
  readonly name: string;
  sendAlert(
    event: SecurityEvent,
  ): Promise<{ success: boolean; errorMessage?: string }>;
}

/** DI token. */
export const SECURITY_ALERT_ADAPTER = Symbol("SECURITY_ALERT_ADAPTER");

/**
 * Default no-op alarm adapter. Hiçbir şey göndermez, yalnızca
 * log'a yazar. Test/dev ortamı için uygundur; production'da
 * gerçek adapter (Slack/PagerDuty) ile override edilmelidir.
 */
@Injectable()
export class NoopSecurityAlertAdapter implements SecurityAlertAdapter {
  public readonly name = "noop";
  private readonly logger = new Logger(NoopSecurityAlertAdapter.name);

  public async sendAlert(event: SecurityEvent): Promise<{ success: boolean }> {
    this.logger.warn(
      `[${event.type}] security alert (${event.severity}) fingerprint=${event.fingerprint} route=${event.route}`,
    );
    return { success: true };
  }
}

/* --------------------------------------------------------------------------
 * Fingerprint + normalize (ErrorEvent ile aynı mantık)
 * --------------------------------------------------------------------------
 */

/** Mesajı fingerprint üretimi için normalize eder. */
export function normalizeSecurityMessage(msg: string): string {
  return msg
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<uuid>",
    )
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Fingerprint üretir. 16 hex karakter. */
export function computeSecurityFingerprint(
  type: string,
  module: string,
  message: string,
): string {
  const normalized = normalizeSecurityMessage(message);
  const h = createHash("sha256");
  h.update(`${type}|${module}|${normalized}`);
  return h.digest("hex").slice(0, 16);
}

/* --------------------------------------------------------------------------
 * Default errorCode map (type → VET-XXXX-NNNN)
 * --------------------------------------------------------------------------
 */

/** Type'a göre default errorCode. Caller override edebilir. */
const DEFAULT_ERROR_CODE: Readonly<Record<string, ErrorCode>> = {
  failed_login: "VET-AUTH-0002",
  unauthorized_access_attempt: "VET-AUTHZ-0002",
  suspicious_export: "VET-AUDIT-0002",
  role_change: "VET-RBAC-0002",
  tenant_isolation_breach_attempt: "VET-TENANT-0002",
};

/** Type'a göre default severity (caller override edebilir). */
const DEFAULT_SEVERITY: Readonly<Record<string, SecurityEventSeverity>> = {
  failed_login: "warning",
  unauthorized_access_attempt: "warning",
  suspicious_export: "error",
  role_change: "info",
  tenant_isolation_breach_attempt: "critical",
};

/** Type'a göre default `errorCode`. */
export function defaultErrorCodeForType(
  type: SecurityEventCreateInput["type"],
): ErrorCode {
  const errorCode: ErrorCode | undefined = Reflect.get(
    DEFAULT_ERROR_CODE,
    type,
  );
  return errorCode ?? "VET-SEC-0001";
}

/** Type'a göre default severity. */
export function defaultSeverityForType(
  type: SecurityEventCreateInput["type"],
): SecurityEventSeverity {
  const severity: SecurityEventSeverity | undefined = Reflect.get(
    DEFAULT_SEVERITY,
    type,
  );
  return severity ?? "warning";
}

/* --------------------------------------------------------------------------
 * Service
 * --------------------------------------------------------------------------
 */

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);
  private readonly masker = new PiiMasker();

  public constructor(
    private readonly repo: SecurityEventsRepository,
    @Optional()
    @Inject(SECURITY_ALERT_ADAPTER)
    private readonly alertAdapter?: SecurityAlertAdapter,
  ) {}

  // -------------------------------------------------------------------------
  // recordSecurityEvent
  // -------------------------------------------------------------------------

  /**
   * Bir güvenlik olayını persist eder. Fingerprint hesaplanır;
   * aynı fingerprint için mevcut kayıt varsa occurrenceCount
   * artırılır. Severity=critical ise ve alertSent=false ise
   * alarm adapter tetiklenir.
   *
   * Caller tarafından sağlanan `actor` zorunludur; tenant/branch/
   * userId/actorType/requestId/ipAddress/userAgentHash/country
   * alanları buradan türetilir (istemciye güvenilmez).
   *
   * Modül seçimi (öncelik sırasıyla):
   * 1. `derivedModule` parametresi (test override'ı).
   * 2. `input.module` — caller belirtti ise.
   * 3. `moduleFromRoute(route)` — path'ten türetilir.
   *
   * NOT: Bu metot hata fırlatmaz; sadece loglar. Filter'ın veya
   * guard'ın ana hata akışını engellemez.
   */
  public recordSecurityEvent(
    input: SecurityEventCreateInput,
    actor: ActorContext,
    derivedModule?: SecurityEventModule,
  ): SecurityEvent {
    try {
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const module = this.resolveModule(input, derivedModule);
      const severity = input.severity ?? defaultSeverityForType(input.type);
      const errorCode = input.errorCode ?? defaultErrorCodeForType(input.type);
      const fingerprint =
        input.fingerprint ??
        computeSecurityFingerprint(input.type, module, input.message);
      const safeContext = this.maskContext(input.context);
      const route = input.route ?? actor.correlationId;

      const rec = this.repo.upsertByFingerprint({
        fingerprint,
        record: {
          requestId: actor.correlationId,
          tenantId: actor.tenantId,
          branchId: actor.branchId,
          userId: actor.actorId,
          actorType: actor.actorType,
          type: input.type,
          module,
          route,
          release: APP_RELEASE,
          severity,
          errorCode,
          message: input.message,
          statusCode: input.statusCode ?? null,
          ipAddress: actor.ipAddress,
          userAgentHash: actor.userAgentHash,
          context: safeContext,
          country: this.countryForActor(actor),
          occurredAt,
        },
      });
      void this.persistSnapshot(rec);

      const event = toSecurityEvent(rec);

      // Critical olayda ve alertSent=false ise alarm adapter tetikle.
      if (severity === "critical" && !rec.alertSent) {
        void this.fireAlert(event);
      }
      return event;
    } catch (err) {
      this.logger.error(
        `SecurityEvent kaydı başarısız: ${(err as Error).message}`,
        err instanceof Error ? err.stack : String(err),
      );
      // Yine de minimal bir event döndür ki caller null dönmesin.
      return {
        id: "sec-failed",
        requestId: actor.correlationId,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        userId: actor.actorId,
        actorType: actor.actorType,
        type: input.type,
        module: derivedModule ?? input.module ?? "unknown",
        route: input.route ?? actor.correlationId,
        release: APP_RELEASE,
        severity: input.severity ?? "warning",
        fingerprint: input.fingerprint ?? "0000000000000000",
        errorCode: input.errorCode ?? null,
        message: input.message,
        statusCode: input.statusCode ?? null,
        ipAddress: actor.ipAddress,
        userAgentHash: actor.userAgentHash,
        context: {},
        country: "SYSTEM",
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        firstSeenAt: input.occurredAt ?? new Date().toISOString(),
        lastSeenAt: input.occurredAt ?? new Date().toISOString(),
        occurrenceCount: 1,
        alertSent: false,
      };
    }
  }

  /**
   * Country tahmini. Şu an için tüm actor'ler TR; GB tenant
   * ayrımı country adapter'dan gelecek (ileride). SYSTEM actor
   * için SYSTEM döner.
   */
  private countryForActor(actor: ActorContext): "TR" | "GB" | "SYSTEM" {
    if (actor.actorType === "system" || !actor.tenantId) return "SYSTEM";
    return "TR";
  }

  /**
   * Modül seçimi. Caller'ın gönderdiği modül "unknown" değilse
   * ona güvenilir; aksi halde route'tan türetilir. Boş route
   * durumunda "unknown" döner.
   */
  private resolveModule(
    input: SecurityEventCreateInput,
    derivedModule?: SecurityEventModule,
  ): SecurityEventModule {
    if (derivedModule) return derivedModule;
    if (input.module && input.module !== "unknown") return input.module;
    if (!input.route) return "unknown";
    return errorModuleFromRoute(input.route);
  }

  /**
   * Context payload'ı PII mask'ler. Null/undefined korunur.
   */
  private maskContext(
    ctx: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (!ctx) return {};
    return this.masker.mask(ctx);
  }

  /**
   * Alarm adapter'i asenkron çağırır; sonuç `alertSent` alanını
   * günceller. Hata oluşursa log'a düşer ve `alertSent=false`
   * korunur (caller tarafından tekrar denenebilir; mevcut
   * implementasyon upsert'te alertSent korunduğu için aynı
   * fingerprint için tekrar çağrılmaz — tasarım gereği).
   */
  private async fireAlert(event: SecurityEvent): Promise<void> {
    if (!this.alertAdapter) {
      this.logger.warn(
        `[${event.type}] security alert atlandı (adapter yok): fingerprint=${event.fingerprint}`,
      );
      return;
    }
    try {
      const result = await this.alertAdapter.sendAlert(event);
      if (result.success) {
        this.repo.markAlertSent(event.fingerprint, event.tenantId);
        const updated = this.repo.findByFingerprint(
          event.fingerprint,
          event.tenantId,
        );
        if (updated) void this.persistSnapshot(updated);
      } else {
        this.logger.warn(
          `[${event.type}] security alert başarısız: ${result.errorMessage ?? "unknown"}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `security alert adapter hatası: ${(err as Error).message}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // -------------------------------------------------------------------------
  // listSecurityEvents
  // -------------------------------------------------------------------------

  public async listSecurityEvents(
    filters: SecurityEventFilters,
    actor: ActorContext,
  ): Promise<SecurityEventListResponse> {
    this.requireSuperadmin(actor);
    const result = this.repo.search({
      type: filters.type,
      severity: filters.severity,
      module: filters.module,
      fingerprint: filters.fingerprint,
      tenantId: filters.tenantId,
      branchId: filters.branchId,
      userId: filters.userId,
      country: filters.country,
      release: filters.release,
      route: filters.route,
      from: filters.from,
      to: filters.to,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map(toSecurityEvent),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getSecurityEventDetail
  // -------------------------------------------------------------------------

  public async getSecurityEventDetail(
    id: string,
    actor: ActorContext,
  ): Promise<SecurityEvent> {
    this.requireSuperadmin(actor);
    const rec = this.repo.findById(id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-AUDIT-0001",
        message: "Güvenlik olayı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-AUDIT-0001",
        details: { id },
      });
    }
    return toSecurityEvent(rec);
  }

  // -------------------------------------------------------------------------
  // getSecurityEventSummary
  // -------------------------------------------------------------------------

  public async getSecurityEventSummary(
    filters: SecurityEventSummaryQuery,
    actor: ActorContext,
  ): Promise<SecurityEventSummary> {
    this.requireSuperadmin(actor);
    const all = this.repo.all().filter((r) => {
      if (filters.type && r.type !== filters.type) return false;
      if (filters.module && r.module !== filters.module) return false;
      if (filters.country && r.country !== filters.country) return false;
      if (filters.from && r.lastSeenAt < filters.from) return false;
      if (filters.to && r.lastSeenAt > filters.to) return false;
      return true;
    });

    const bySeverity = new Map<string, number>();
    const byType = new Map<string, number>();
    type Bucket = {
      fingerprint: string;
      type: SecurityEventRecord["type"];
      severity: SecurityEventRecord["severity"];
      module: SecurityEventModule;
      message: string;
      eventCount: number;
      tenants: Set<string>;
      users: Set<string>;
      firstSeenAt: string;
      lastSeenAt: string;
      alertSent: boolean;
    };
    const bucketMap = new Map<string, Bucket>();

    for (const rec of all) {
      bySeverity.set(
        rec.severity,
        (bySeverity.get(rec.severity) ?? 0) + rec.occurrenceCount,
      );
      byType.set(rec.type, (byType.get(rec.type) ?? 0) + rec.occurrenceCount);
      const key = rec.fingerprint;
      const existing = bucketMap.get(key);
      if (existing) {
        existing.eventCount += rec.occurrenceCount;
        if (rec.tenantId) existing.tenants.add(rec.tenantId);
        if (rec.userId) existing.users.add(rec.userId);
        if (rec.occurredAt < existing.firstSeenAt) {
          existing.firstSeenAt = rec.occurredAt;
        }
        if (rec.occurredAt > existing.lastSeenAt) {
          existing.lastSeenAt = rec.occurredAt;
        }
        if (rec.alertSent) existing.alertSent = true;
      } else {
        bucketMap.set(key, {
          fingerprint: rec.fingerprint,
          type: rec.type,
          severity: rec.severity,
          module: rec.module,
          message: rec.message,
          eventCount: rec.occurrenceCount,
          tenants: rec.tenantId ? new Set([rec.tenantId]) : new Set(),
          users: rec.userId ? new Set([rec.userId]) : new Set(),
          firstSeenAt: rec.occurredAt,
          lastSeenAt: rec.occurredAt,
          alertSent: rec.alertSent,
        });
      }
    }

    const topGroups: SecurityEventGroup[] = Array.from(bucketMap.values())
      .sort((a, b) => {
        if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
        return b.lastSeenAt.localeCompare(a.lastSeenAt);
      })
      .slice(0, 20)
      .map((b) => ({
        fingerprint: b.fingerprint,
        type: b.type,
        severity: b.severity,
        module: b.module,
        message: b.message,
        eventCount: b.eventCount,
        uniqueTenants: b.tenants.size,
        uniqueUsers: b.users.size,
        firstSeenAt: b.firstSeenAt,
        lastSeenAt: b.lastSeenAt,
        alertSent: b.alertSent,
      }));

    const fromTs =
      filters.from ??
      (all.length > 0
        ? all.reduce(
            (min, r) => (r.lastSeenAt < min ? r.lastSeenAt : min),
            all[0]!.lastSeenAt,
          )
        : null);
    const toTs =
      filters.to ??
      (all.length > 0
        ? all.reduce(
            (max, r) => (r.lastSeenAt > max ? r.lastSeenAt : max),
            all[0]!.lastSeenAt,
          )
        : null);

    return {
      total: all.reduce((sum, r) => sum + r.occurrenceCount, 0),
      bySeverity: Array.from(bySeverity.entries())
        .map(([severity, count]) => ({
          severity: severity as SecurityEventSeverity,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      byType: Array.from(byType.entries())
        .map(([type, count]) => ({
          type: type as SecurityEventRecord["type"],
          count,
        }))
        .sort((a, b) => b.count - a.count),
      topGroups,
      windowFrom: fromTs,
      windowTo: toTs,
    };
  }

  // -------------------------------------------------------------------------
  // recordClientSecurityEvent
  // -------------------------------------------------------------------------

  /**
   * Frontend tarafından gönderilen güvenlik raporlarını kabul
   * eder. Auth placeholder tüm oturum açmış kullanıcılara
   * izin verir (system namespace). İstemciden gelen
   * tenant/branch/userId/actorType/requestId/country bilgilerine
   * GÜVENİLMEZ; bunlar aktör bağlamından türetilir.
   */
  public recordClientSecurityEvent(
    body: ClientSecurityEventInput,
    actor: ActorContext,
  ): ClientSecurityEventResponse {
    const event = this.recordSecurityEvent(
      {
        type: body.type,
        message: body.message,
        severity: body.severity ?? defaultSeverityForType(body.type),
        errorCode: body.errorCode,
        statusCode: body.statusCode,
        context: body.context,
        route: body.route,
        occurredAt: body.occurredAt,
      },
      actor,
    );
    return {
      id: event.id,
      fingerprint: event.fingerprint,
      alertSent: event.alertSent,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private requireSuperadmin(actor: ActorContext): void {
    if (actor.role === "SUPERADMIN" || actor.isSuperadmin) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem yalnızca SUPERADMIN için",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  /** Kalıcılık hatasını ana güvenlik/guard akışından ayırır. */
  private async persistSnapshot(record: SecurityEventRecord): Promise<void> {
    try {
      await this.repo.persistSnapshot(record);
    } catch (error) {
      this.logger.error(
        `SecurityEvent kalıcılığı başarısız: ${
          error instanceof Error ? error.name : "UnknownError"
        }`,
      );
    }
  }
}
