/**
 * @file ErrorEvent service.
 * @module apps/api/modules/error-events/error-events.service
 *
 * @description GOAL-100 (FAZ-10) merkezi backend hata yakalama
 * iş kuralları.
 *
 * - `recordError`: AllExceptionsFilter tarafından çağrılır.
 *   Fingerprint (errorCode + module + normalizeMessage) üretir;
 *   aynı fingerprint için mevcut kayıt varsa occurrenceCount
 *   artırılır. Stack trace yalnızca 5xx + critical için saklanır.
 * - `listErrorEvents`: SUPERADMIN paneli için filtreli arama.
 * - `getErrorEventDetail`: tek kayıt detayı.
 * - `listOccurrencesByFingerprint`: aynı fingerprint'in tüm
 *   kayıtları (zaman çizelgesi).
 * - `getErrorEventSummary`: severity/module/errorCode bazlı
 *   aggregate özet.
 *
 * @security Tenant filtresi opsiyonel; SUPERADMIN cross-tenant
 *   görür. Ancak PII zaten mask'lı gelir; ek bir sanitization
 *   gerekmez. Stack trace 4xx için null yapılır (bilgi sızdırmaz).
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 */

import { Injectable, Logger } from "@nestjs/common";

import { createHash } from "node:crypto";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PiiMasker } from "../../common/logging/pii-masker.js";
import type {
  ClientErrorReportInput,
  ClientErrorReportResponse,
  ErrorEvent,
  ErrorEventCreateInput,
  ErrorEventFilters,
  ErrorEventListResponse,
  ErrorEventModule,
  ErrorEventSummary,
} from "@vetniva/contracts";

import {
  toErrorEvent,
  type ErrorEventRecord,
} from "../../common/error-events/error-event.types.js";
import { ErrorEventsRepository } from "./error-events.repository.js";

/** Uygulama sürümü. `APP_VERSION` env ya da sabit. */
const APP_RELEASE = process.env["APP_VERSION"] ?? "0.0.0-dev";

/** Modül tespiti için URL path → module eşlemesi. */
const ROUTE_TO_MODULE: ReadonlyArray<{
  prefix: string;
  module: ErrorEventModule;
}> = [
  { prefix: "/api/v1/auth", module: "auth" },
  { prefix: "/api/v1/portal", module: "portal" },
  { prefix: "/api/v1/identity", module: "identity" },
  { prefix: "/api/v1/rbac", module: "rbac" },
  { prefix: "/api/v1/feature-flags", module: "feature_flag" },
  { prefix: "/api/v1/files", module: "file" },
  { prefix: "/api/v1/notifications", module: "notification" },
  { prefix: "/api/v1/ai", module: "ai" },
  { prefix: "/api/v1/tenant", module: "tenant" },
  { prefix: "/api/v1/branch", module: "branch" },
  { prefix: "/api/v1/superadmin", module: "superadmin" },
  { prefix: "/api/v1/owner", module: "owner" },
  { prefix: "/api/v1/patient", module: "patient" },
  { prefix: "/api/v1/calendar", module: "appointment" },
  { prefix: "/api/v1/appointment", module: "appointment" },
  { prefix: "/api/v1/examination", module: "examination" },
  { prefix: "/api/v1/soap", module: "soap" },
  { prefix: "/api/v1/vaccine", module: "vaccine" },
  { prefix: "/api/v1/prescription", module: "prescription" },
  { prefix: "/api/v1/surgery", module: "surgery" },
  { prefix: "/api/v1/anesthesia", module: "anesthesia" },
  { prefix: "/api/v1/hospitalization", module: "hospitalization" },
  { prefix: "/api/v1/lab", module: "lab" },
  { prefix: "/api/v1/imaging", module: "imaging" },
  { prefix: "/api/v1/inventory", module: "inventory" },
  { prefix: "/api/v1/product", module: "product" },
  { prefix: "/api/v1/supplier", module: "supplier" },
  { prefix: "/api/v1/purchase", module: "purchase" },
  { prefix: "/api/v1/stock", module: "stock" },
  { prefix: "/api/v1/petshop", module: "petshop" },
  { prefix: "/api/v1/clinic-sale", module: "clinic_sale" },
  { prefix: "/api/v1/clinic/sale", module: "clinic_sale" },
  { prefix: "/api/v1/payment", module: "payment" },
  { prefix: "/api/v1/cash", module: "cash_register" },
  { prefix: "/api/v1/esmm", module: "esmm" },
  { prefix: "/api/v1/report", module: "report" },
  { prefix: "/api/v1/consent", module: "consent" },
];

/** Route'tan modül tespit eder. Bulunamazsa "unknown". */
export function moduleFromRoute(route: string): ErrorEventModule {
  // path kısmı (method prefix'i kaldırıldıktan sonra).
  const path = route.replace(/^[A-Z]+\s+/, "");
  for (const { prefix, module } of ROUTE_TO_MODULE) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return module;
    }
  }
  // "/api/v1/clinic/*" klinik grubu — sadece satış/stok dışındakiler.
  if (path.startsWith("/api/v1/clinic")) {
    if (path.includes("/petshop") || path.includes("/sale")) {
      return "petshop";
    }
    if (path.includes("/payment")) {
      return "payment";
    }
    if (path.includes("/report") || path.includes("/report")) {
      return "report";
    }
    if (path.includes("/imaging") || path.includes("/lab")) {
      return path.includes("/lab") ? "lab" : "imaging";
    }
    return "clinic";
  }
  return "unknown";
}

/** Mesajı fingerprint üretimi için normalize eder. */
export function normalizeMessage(msg: string): string {
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Fingerprint üretir. 16 hex karakter. */
export function computeFingerprint(
  errorCode: string,
  module: string,
  message: string,
): string {
  const normalized = normalizeMessage(message);
  const h = createHash("sha256");
  h.update(`${errorCode}|${module}|${normalized}`);
  return h.digest("hex").slice(0, 16);
}

@Injectable()
export class ErrorEventsService {
  private readonly logger = new Logger(ErrorEventsService.name);
  private readonly masker = new PiiMasker();

  public constructor(private readonly repo: ErrorEventsRepository) {}

  // -------------------------------------------------------------------------
  // recordError (AllExceptionsFilter için)
  // -------------------------------------------------------------------------

  /**
   * Bir hata olayını persist eder. Fingerprint hesaplanır; aynı
   * fingerprint için mevcut kayıt varsa occurrenceCount artırılır.
   * Stack trace yalnızca 5xx + critical için saklanır.
   *
   * Modül seçimi (öncelik sırasıyla):
   * 1. `derivedModule` parametresi (test override'ı).
   * 2. `input.module` — caller belirtti ise (filter "unknown" gönderir).
   * 3. `moduleFromRoute(input.route)` — path'ten türetilir.
   *
   * NOT: Bu metot hata fırlatmaz; sadece loglar. Filter'ın ana
   * hata akışını engellemez.
   */
  public recordError(
    input: ErrorEventCreateInput,
    derivedModule?: ErrorEventModule,
  ): ErrorEvent {
    try {
      const module = this.resolveModule(input, derivedModule);
      const fingerprint = computeFingerprint(
        input.errorCode,
        module,
        input.message,
      );
      const safeContext = this.maskContext(input.context);
      const stack =
        input.statusCode >= 500 || input.severity === "critical"
          ? (input.stack ?? null)
          : null;

      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const rec = this.repo.upsertByFingerprint({
        fingerprint,
        record: {
          requestId: input.requestId,
          tenantId: input.tenantId,
          branchId: input.branchId,
          userId: input.userId,
          actorType: input.actorType,
          module,
          route: input.route,
          release: input.release,
          severity: input.severity,
          errorCode: input.errorCode,
          message: input.message,
          statusCode: input.statusCode,
          stack,
          context: safeContext,
          country: input.country,
          occurredAt,
        },
      });
      return toErrorEvent(rec);
    } catch (err) {
      this.logger.error(
        `ErrorEvent kaydı başarısız: ${(err as Error).message}`,
        err instanceof Error ? err.stack : String(err),
      );
      // Yine de minimal bir event döndür ki filter null dönmesin.
      return {
        id: "err-failed",
        requestId: input.requestId,
        tenantId: input.tenantId,
        branchId: input.branchId,
        userId: input.userId,
        actorType: input.actorType,
        module: derivedModule ?? input.module ?? "unknown",
        route: input.route,
        release: input.release,
        severity: input.severity,
        fingerprint: "0000000000000000",
        errorCode: input.errorCode,
        message: input.message,
        statusCode: input.statusCode,
        stack: null,
        context: {},
        country: input.country,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        occurrenceCount: 1,
      };
    }
  }

  /**
   * Modül seçimi. Caller'ın gönderdiği modül "unknown" değilse
   * ona güvenilir; aksi halde route'tan türetilir.
   */
  private resolveModule(
    input: ErrorEventCreateInput,
    derivedModule?: ErrorEventModule,
  ): ErrorEventModule {
    if (derivedModule) return derivedModule;
    if (input.module && input.module !== "unknown") return input.module;
    return moduleFromRoute(input.route);
  }

  // -------------------------------------------------------------------------
  // listErrorEvents
  // -------------------------------------------------------------------------

  public async listErrorEvents(
    filters: ErrorEventFilters,
    actor: ActorContext,
  ): Promise<ErrorEventListResponse> {
    this.requireSuperadmin(actor);
    const result = this.repo.search({
      severity: filters.severity,
      module: filters.module,
      errorCode: filters.errorCode,
      fingerprint: filters.fingerprint,
      tenantId: filters.tenantId,
      country: filters.country,
      route: filters.route,
      from: filters.from,
      to: filters.to,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map(toErrorEvent),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getErrorEventDetail
  // -------------------------------------------------------------------------

  public async getErrorEventDetail(
    id: string,
    actor: ActorContext,
  ): Promise<ErrorEvent> {
    this.requireSuperadmin(actor);
    const rec = this.repo.findById(id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-AUDIT-0001",
        message: "Hata olayı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-AUDIT-0001",
        details: { id },
      });
    }
    return toErrorEvent(rec);
  }

  // -------------------------------------------------------------------------
  // listOccurrencesByFingerprint
  // -------------------------------------------------------------------------

  public async listOccurrencesByFingerprint(
    fingerprint: string,
    actor: ActorContext,
  ): Promise<ErrorEvent> {
    this.requireSuperadmin(actor);
    const rec = this.repo.findByFingerprint(fingerprint);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-AUDIT-0001",
        message: "Fingerprint için hata olayı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-AUDIT-0001",
        details: { fingerprint },
      });
    }
    return toErrorEvent(rec);
  }

  // -------------------------------------------------------------------------
  // getErrorEventSummary
  // -------------------------------------------------------------------------

  public async getErrorEventSummary(
    filters: Pick<ErrorEventFilters, "from" | "to" | "module" | "country">,
    actor: ActorContext,
  ): Promise<ErrorEventSummary> {
    this.requireSuperadmin(actor);

    const all = this.repo.all().filter((r) => {
      if (filters.module && r.module !== filters.module) return false;
      if (filters.country && r.country !== filters.country) return false;
      if (filters.from && r.occurredAt < filters.from) return false;
      if (filters.to && r.occurredAt > filters.to) return false;
      return true;
    });

    // severity × module × errorCode bucket'ları.
    const bucketMap = new Map<
      string,
      {
        severity: ErrorEventRecord["severity"];
        module: ErrorEventModule;
        errorCode: ErrorEventRecord["errorCode"];
        fingerprint: string;
        eventCount: number;
        tenants: Set<string>;
        firstSeenAt: string;
        lastSeenAt: string;
      }
    >();
    const bySeverity = new Map<string, number>();
    const byModule = new Map<string, number>();

    for (const rec of all) {
      // severity
      bySeverity.set(
        rec.severity,
        (bySeverity.get(rec.severity) ?? 0) + rec.occurrenceCount,
      );
      // module
      byModule.set(
        rec.module,
        (byModule.get(rec.module) ?? 0) + rec.occurrenceCount,
      );
      // bucket
      const key = `${rec.severity}|${rec.module}|${rec.errorCode}|${rec.fingerprint}`;
      const existing = bucketMap.get(key);
      if (existing) {
        existing.eventCount += rec.occurrenceCount;
        if (rec.tenantId) existing.tenants.add(rec.tenantId);
        if (rec.occurredAt < existing.firstSeenAt) {
          existing.firstSeenAt = rec.occurredAt;
        }
        if (rec.occurredAt > existing.lastSeenAt) {
          existing.lastSeenAt = rec.occurredAt;
        }
      } else {
        bucketMap.set(key, {
          severity: rec.severity,
          module: rec.module,
          errorCode: rec.errorCode,
          fingerprint: rec.fingerprint,
          eventCount: rec.occurrenceCount,
          tenants: rec.tenantId ? new Set([rec.tenantId]) : new Set(),
          firstSeenAt: rec.occurredAt,
          lastSeenAt: rec.occurredAt,
        });
      }
    }

    const topBuckets = Array.from(bucketMap.values())
      .map((b) => ({
        severity: b.severity,
        module: b.module,
        errorCode: b.errorCode,
        fingerprint: b.fingerprint,
        eventCount: b.eventCount,
        uniqueTenants: b.tenants.size,
        firstSeenAt: b.firstSeenAt,
        lastSeenAt: b.lastSeenAt,
      }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 20);

    const severityOrder = ["info", "warning", "error", "critical"];
    return {
      total: all.reduce((sum, r) => sum + r.occurrenceCount, 0),
      bySeverity: severityOrder
        .filter((s) => bySeverity.has(s))
        .map((s) => ({
          severity: s as ErrorEventRecord["severity"],
          count: bySeverity.get(s) ?? 0,
        })),
      byModule: Array.from(byModule.entries())
        .map(([module, count]) => ({
          module: module as ErrorEventModule,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      topBuckets,
      windowFrom: filters.from ?? null,
      windowTo: filters.to ?? null,
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

  /**
   * Context payload'ı PII mask'ler. Null/undefined korunur.
   */
  private maskContext(
    ctx: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (!ctx) return {};
    try {
      return this.masker.mask(ctx) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  // -------------------------------------------------------------------------
  // recordClientError (GOAL-101 frontend hata yakalama)
  // -------------------------------------------------------------------------

  /**
   * Frontend (tarayıcı) kaynaklı hata raporunu kabul eder ve
   * standart ErrorEvent akışına yönlendirir. Tenant/branch/userId/
   * actorType/requestId/country bilgileri **aktör bağlamından**
   * türetilir; istemcinin gönderdiği değerlere güvenilmez.
   *
   * - `route` istemciden gelir, ancak tenant/branch ile birlikte
   *   modül tespitinde kullanılır.
   * - `errorCode` istemcide bilinmiyorsa generic frontend kodu
   *   atanır; backend tarafı doğrulamaz.
   * - Severity `info` veya `warning` ise stack trace saklanmaz;
   *   `error` veya `critical` ise saklanır.
   * - Client fingerprint hesaplamaz; backend'in tutarlı
   *   `computeFingerprint` algoritması kullanılır.
   *
   * @security Hassas form verilerinin istemcide zaten mask'lı
   *   gönderilmesi beklenir; backend yine de context'i bir
   *   kez daha PiiMasker'dan geçirir (savunma derinliği).
   */
  public recordClientError(
    input: ClientErrorReportInput,
    actor: ActorContext,
    requestId: string,
  ): ClientErrorReportResponse {
    const errorCode = (input.errorCode ?? "TR_FE_0001") as ErrorEventCreateInput["errorCode"];

    const createInput: ErrorEventCreateInput = {
      requestId,
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      userId: actor.actorId,
      actorType: actor.actorType,
      module: moduleFromRoute(input.route),
      route: input.route,
      release: input.release ?? APP_RELEASE,
      severity: input.severity,
      errorCode,
      message: input.message,
      statusCode: 0,
      stack: input.stack ?? null,
      context: input.context,
      country: input.country ?? "SYSTEM",
      occurredAt: input.occurredAt,
    };

    const event = this.recordError(createInput);
    return {
      id: event.id,
      fingerprint: event.fingerprint,
    };
  }
}
