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
 *   Kayıt `resolved` durumundaysa otomatik `reopened`'a terfi
 *   edilir (yeni hata oluştu olarak işaretlenir).
 * - `listErrorEvents`: SUPERADMIN paneli için filtreli arama.
 * - `getErrorEventDetail`: tek kayıt detayı.
 * - `listOccurrencesByFingerprint`: aynı fingerprint'in tüm
 *   kayıtları (zaman çizelgesi).
 * - `getErrorEventSummary`: severity/module/errorCode bazlı
 *   aggregate özet.
 * - `updateErrorEventStatus` (GOAL-103): state machine
 *   doğrulaması + transition log + opsiyonel atama.
 * - `listErrorEventTransitions` (GOAL-103): fingerprint
 *   bazlı tüm status geçişleri.
 * - `listErrorEventGroups` / `getErrorEventGroup` (GOAL-103):
 *   fingerprint grupları (özet ekranı için).
 *
 * GOAL-104 ile birlikte eklenen iş kuralları:
 * - `addErrorEventNote` / `listErrorEventNotes`: çözüm notları
 *   (append-only, PII mask'lı, SUPERADMIN yetkisi).
 * - `addErrorEventSupportLink` / `listErrorEventSupportLinks`:
 *   JIRA/Linear/Zendesk/GitHub destek bağlantıları.
 * - `assignErrorEvent` / `unassignErrorEvent`: atama aksiyonu
 *   (status değiştirmez; sadece atama geçmişine kayıt düşer).
 * - `listErrorEventAssignments`: atama geçmişi.
 * - `listErrorEventAuditLog`: status transition + not + destek
 *   bağlantısı + atama aksiyonlarını occurredAt artan sırada
 *   birleşik timeline olarak döner.
 *
 * @security Tenant filtresi opsiyonel; SUPERADMIN cross-tenant
 *   görür. Ancak PII zaten mask'lı gelir; ek bir sanitization
 *   gerekmez. Stack trace 4xx için null yapılır (bilgi sızdırmaz).
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 * @updated GOAL-104 (FAZ-10) hata atama ve çözüm notları core
 */

import { createHash } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

import { ErrorEventsRepository } from "./error-events.repository.js";
import {
  UNASSIGNED,
  toErrorEvent,
  toErrorEventAssignment,
  toErrorEventNote,
  toErrorEventStatusTransition,
  toErrorEventSupportLink,
  type ErrorEventNoteRecord,
  type ErrorEventRecord,
  type ErrorEventStatusTransitionRecord,
  type ErrorEventSupportLinkRecord,
} from "../../common/error-events/error-event.types.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PiiMasker } from "../../common/logging/pii-masker.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  ClientErrorReportInput,
  ClientErrorReportResponse,
  ErrorEvent,
  ErrorEventAssignmentInput,
  ErrorEventAssignmentListResponse,
  ErrorEventAssignmentResponse,
  ErrorEventAuditEntry,
  ErrorEventAuditLogResponse,
  ErrorEventCreateInput,
  ErrorEventFilters,
  ErrorEventGroup,
  ErrorEventGroupFilters,
  ErrorEventGroupListResponse,
  ErrorEventListResponse,
  ErrorEventListTransitionsResponse,
  ErrorEventModule,
  ErrorEventNoteCreateInput,
  ErrorEventNoteListResponse,
  ErrorEventStatus,
  ErrorEventStatusUpdateInput,
  ErrorEventStatusUpdateResponse,
  ErrorEventSummary,
  ErrorEventSupportLinkInput,
  ErrorEventSupportLinkListResponse,
} from "@vetniva/contracts";

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

/* --------------------------------------------------------------------------
 * State machine — GOAL-103
 * --------------------------------------------------------------------------
 */

/** Geçerli status geçişlerini döner. */
const VALID_TRANSITIONS: Readonly<
  Record<ErrorEventStatus, ReadonlyArray<ErrorEventStatus>>
> = {
  new: ["investigating", "resolved"],
  investigating: ["resolved", "new"],
  resolved: ["reopened", "investigating"],
  reopened: ["investigating", "resolved"],
};

/** İki status arasındaki geçişin geçerli olup olmadığını söyler. */
export function isValidTransition(
  from: ErrorEventStatus,
  to: ErrorEventStatus,
): boolean {
  if (from === to) return false;
  const allowed: ReadonlyArray<ErrorEventStatus> = Reflect.get(
    VALID_TRANSITIONS,
    from,
  );
  return allowed.includes(to);
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
   * Mevcut kayıt `resolved` durumundaysa otomatik `reopened`'a
   * terfi edilir (sistem kaynaklı geçiş, append-only log'a yazılır).
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

      // Mevcut kayıt resolved ise otomatik reopened'a terfi.
      const existing = this.repo.findByFingerprint(fingerprint, input.tenantId);
      const willReopen = existing !== null && existing.status === "resolved";

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

      if (willReopen) {
        // Otomatik terfi: resolved → reopened (sistem kaynaklı).
        const autoUpdate = this.repo.updateStatus(rec.id, {
          toStatus: "reopened",
          actorId: "system",
          actorType: "system",
          reason: "Yeni hata oluştu — otomatik reopened terfisi",
        });
        const reopened = autoUpdate?.record ?? rec;
        void this.persistBestEffort(reopened);
        return toErrorEvent(reopened);
      }
      void this.persistBestEffort(rec);
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
        firstSeenAt: input.occurredAt ?? new Date().toISOString(),
        lastSeenAt: input.occurredAt ?? new Date().toISOString(),
        occurrenceCount: 1,
        status: "new",
        assignedToUserId: null,
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
      branchId: filters.branchId,
      country: filters.country,
      release: filters.release,
      route: filters.route,
      status: filters.status,
      assignedToUserId: filters.assignedToUserId,
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
      if (filters.from && r.lastSeenAt < filters.from) return false;
      if (filters.to && r.lastSeenAt > filters.to) return false;
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
  // updateErrorEventStatus — GOAL-103
  // -------------------------------------------------------------------------

  /**
   * Bir hata olayının durumunu günceller. State machine
   * doğrulaması yapılır; geçersiz geçişlerde 422 döner. Başarılı
   * durumda append-only transition log'a yeni kayıt eklenir ve
   * opsiyonel atama güncellenir.
   *
   * İzin: yalnızca SUPERADMIN (audit:log:read) — controller guard
   * tarafında zorunlu; burada da `requireSuperadmin` ile korunur.
   */
  public async updateErrorEventStatus(
    id: string,
    input: ErrorEventStatusUpdateInput,
    actor: ActorContext,
  ): Promise<ErrorEventStatusUpdateResponse> {
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
    if (!isValidTransition(rec.status, input.toStatus)) {
      throw new DomainError({
        errorCode: "VET-ERRSTAT-0001",
        message: `Geçersiz durum geçişi: ${rec.status} → ${input.toStatus}`,
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-ERRSTAT-0001",
        details: { from: rec.status, to: input.toStatus },
      });
    }
    const result = this.repo.updateStatus(id, {
      toStatus: input.toStatus,
      actorId: actor.actorId ?? "system",
      actorType: actor.actorType,
      reason: input.reason ?? null,
      assignedToUserId: input.assignedToUserId,
      clearAssignment: input.clearAssignment,
    });
    if (!result) {
      throw new DomainError({
        errorCode: "VET-AUDIT-0001",
        message: "Hata olayı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-AUDIT-0001",
        details: { id },
      });
    }
    return {
      event: toErrorEvent(result.record),
      transition: toErrorEventStatusTransition(result.transition),
    };
  }

  // -------------------------------------------------------------------------
  // listErrorEventTransitions — GOAL-103
  // -------------------------------------------------------------------------

  public async listErrorEventTransitions(
    id: string,
    actor: ActorContext,
  ): Promise<ErrorEventListTransitionsResponse> {
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
    const items = this.repo
      .listTransitionsByFingerprint(rec.fingerprint, rec.tenantId)
      .map(toErrorEventStatusTransition);
    return {
      fingerprint: rec.fingerprint,
      items,
      total: items.length,
    };
  }

  // -------------------------------------------------------------------------
  // listErrorEventGroups / getErrorEventGroup — GOAL-103
  // -------------------------------------------------------------------------

  /**
   * Fingerprint grupları (fingerprint başına tek satır). SUPERADMIN
   * hata merkezi özet ekranı için tasarlandı. Filtreler aynı
   * search semantiğini uygular; sıralama occurrenceCount DESC.
   */
  public async listErrorEventGroups(
    filters: ErrorEventGroupFilters,
    actor: ActorContext,
  ): Promise<ErrorEventGroupListResponse> {
    this.requireSuperadmin(actor);
    const all = this.repo.listByFingerprint({
      severity: filters.severity,
      module: filters.module,
      errorCode: filters.errorCode,
      tenantId: filters.tenantId,
      branchId: filters.branchId,
      country: filters.country,
      release: filters.release,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      route: undefined,
    });

    // Filtre: search (message + route).
    let filtered = all;
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.message.toLowerCase().includes(needle) ||
          r.route.toLowerCase().includes(needle),
      );
    }

    // Benzersiz fingerprint grupları.
    const byFp = new Map<string, ErrorEventRecord>();
    for (const r of filtered) {
      if (!byFp.has(r.fingerprint)) byFp.set(r.fingerprint, r);
    }

    const items: ErrorEventGroup[] = Array.from(byFp.values())
      .map((r) => this.toGroup(r, filtered))
      .sort((a, b) => b.eventCount - a.eventCount);

    const total = items.length;
    const sliced = items.slice(filters.offset, filters.offset + filters.limit);
    return { items: sliced, total };
  }

  /**
   * Tek fingerprint grubu detayı.
   */
  public async getErrorEventGroup(
    fingerprint: string,
    actor: ActorContext,
  ): Promise<ErrorEventGroup> {
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
    const all = this.repo.all().filter((r) => r.fingerprint === fingerprint);
    return this.toGroup(rec, all);
  }

  /** Yardımcı: bir record'u fingerprint grubu özetine dönüştürür. */
  private toGroup(
    rec: ErrorEventRecord,
    all: ErrorEventRecord[],
  ): ErrorEventGroup {
    // Sadece aynı fingerprint'in kayıtlarını topla; aksi halde tüm
    // tenant'ların toplam occurrenceCount'u gruba yansır (bug).
    const siblings = all.filter((s) => s.fingerprint === rec.fingerprint);
    const tenants = new Set<string>();
    for (const s of siblings) {
      if (s.tenantId) tenants.add(s.tenantId);
    }
    const eventCount = siblings.reduce((sum, s) => sum + s.occurrenceCount, 0);
    return {
      fingerprint: rec.fingerprint,
      severity: rec.severity,
      module: rec.module,
      errorCode: rec.errorCode,
      message: rec.message,
      status: rec.status,
      assignedToUserId: rec.assignedToUserId,
      eventCount,
      uniqueTenants: tenants.size,
      firstSeenAt: rec.firstSeenAt,
      lastSeenAt: rec.lastSeenAt,
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
   * Hata kaydının PostgreSQL snapshot'ını ana hata yanıtını geciktirmeden
   * yazar. Kalıcılık sorunu yalnız loglanır; exception filter hiçbir zaman
   * ikinci bir hata üretmez.
   */
  private async persistBestEffort(record: ErrorEventRecord): Promise<void> {
    try {
      await this.repo.persistSnapshot(record);
    } catch (error) {
      this.logger.error(
        `ErrorEvent kalıcı kaydı başarısız: ${(error as Error).message}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Context payload'ı PII mask'ler. Null/undefined korunur.
   */
  private maskContext(
    ctx: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (!ctx) return {};
    try {
      return this.masker.mask(ctx);
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
    const errorCode = input.errorCode ?? "VET-COMMON-0001";

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

  // -------------------------------------------------------------------------
  // Çözüm notu — GOAL-104
  // -------------------------------------------------------------------------

  /**
   * Bir hata olayına çözüm notu ekler. `id` üzerinden kayıt
   * bulunur, fingerprint türetilir. `authorId`/`authorType` aktör
   * bağlamından gelir (istemci tarafı gönderemez). `body` PII
   * mask'lı saklanır; notlar append-only'dir.
   *
   * İzin: yalnızca SUPERADMIN (audit:log:read).
   */
  public async addErrorEventNote(
    id: string,
    input: Omit<ErrorEventNoteCreateInput, "visibility"> & {
      visibility?: ErrorEventNoteCreateInput["visibility"];
    },
    actor: ActorContext,
  ): Promise<ErrorEventNoteRecord> {
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
    const safeBody = this.maskString(input.body, 4000);
    if (!safeBody) {
      throw new DomainError({
        errorCode: "VET-ERRNOTE-0001",
        message: "Not içeriği zorunludur ve en fazla 4000 karakter olabilir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-ERRNOTE-0001",
      });
    }
    return this.repo.addNote({
      fingerprint: rec.fingerprint,
      authorId: actor.actorId ?? "system",
      authorType: actor.actorType,
      body: safeBody,
      visibility: input.visibility ?? "internal",
    }, rec.tenantId);
  }

  /**
   * Bir hata olayının tüm çözüm notlarını createdAt artan sırada
   * döner. `id` üzerinden kayıt bulunur, fingerprint türetilir.
   *
   * İzin: yalnızca SUPERADMIN (audit:log:read).
   */
  public async listErrorEventNotes(
    id: string,
    actor: ActorContext,
  ): Promise<ErrorEventNoteListResponse> {
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
    const items = this.repo
      .listNotesByFingerprint(rec.fingerprint, rec.tenantId)
      .map(toErrorEventNote);
    return {
      fingerprint: rec.fingerprint,
      items,
      total: items.length,
    };
  }

  // -------------------------------------------------------------------------
  // Destek kaydı bağlantısı — GOAL-104
  // -------------------------------------------------------------------------

  /**
   * Bir hata olayına JIRA/Linear/Zendesk/GitHub destek kaydı
   * bağlantısı ekler. Sistem + externalId + url + title opsiyonel
   * kombinasyonu kabul edilir (en az bir tanımlayıcı zorunlu).
   *
   * İzin: yalnızca SUPERADMIN (audit:log:read).
   */
  public async addErrorEventSupportLink(
    id: string,
    input: ErrorEventSupportLinkInput,
    actor: ActorContext,
  ): Promise<ErrorEventSupportLinkRecord> {
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
    return this.repo.addSupportLink({
      fingerprint: rec.fingerprint,
      system: input.system,
      externalId: input.externalId ?? null,
      url: input.url ?? null,
      title: input.title ?? null,
      createdById: actor.actorId ?? "system",
      createdByType: actor.actorType,
    }, rec.tenantId);
  }

  /**
   * Bir hata olayının tüm destek bağlantılarını createdAt artan
   * sırada döner.
   *
   * İzin: yalnızca SUPERADMIN (audit:log:read).
   */
  public async listErrorEventSupportLinks(
    id: string,
    actor: ActorContext,
  ): Promise<ErrorEventSupportLinkListResponse> {
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
    const items = this.repo
      .listSupportLinksByFingerprint(rec.fingerprint, rec.tenantId)
      .map(toErrorEventSupportLink);
    return {
      fingerprint: rec.fingerprint,
      items,
      total: items.length,
    };
  }

  // -------------------------------------------------------------------------
  // Atama — GOAL-104
  // -------------------------------------------------------------------------

  /**
   * Bir hata olayını geliştirici/sorumluya atar. Append-only kayıt
   * düşer; mevcut atama geçmişi korunur. Status değiştirmez
   * (sadece atama). Hata olayının `assignedToUserId` alanı en son
   * atamayı yansıtır.
   *
   * - `assigneeId`  : yeni atanan kişi ID.
   * - `unassign=true`: mevcut atama kaldırılır (UNASSIGNED sentetik
   *                    kaydı düşer; `assignedToUserId` null olur).
   *
   * İzin: yalnızca SUPERADMIN (audit:log:read).
   */
  public async assignErrorEvent(
    id: string,
    input: ErrorEventAssignmentInput,
    actor: ActorContext,
  ): Promise<ErrorEventAssignmentResponse> {
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
    const isUnassign = input.unassign === true;
    const assigneeId = isUnassign ? UNASSIGNED : (input.assigneeId ?? "");
    if (!assigneeId) {
      throw new DomainError({
        errorCode: "VET-ERRNOTE-0001",
        message: "assigneeId veya unassign=true zorunludur",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-ERRNOTE-0001",
      });
    }
    const assignment = this.repo.addAssignment({
      fingerprint: rec.fingerprint,
      assigneeId,
      assignedById: actor.actorId ?? "system",
      assignedByType: actor.actorType,
      reason: input.reason ?? null,
    }, rec.tenantId);
    // Güncellenmiş event'i tekrar oku (assignedToUserId değişmiş olabilir).
    const updated = this.repo.findById(id);
    return {
      event: toErrorEvent(updated ?? rec),
      assignment: toErrorEventAssignment(assignment),
    };
  }

  /**
   * Bir hata olayının tüm atama geçmişini assignedAt artan sırada
   * döner.
   *
   * İzin: yalnızca SUPERADMIN (audit:log:read).
   */
  public async listErrorEventAssignments(
    id: string,
    actor: ActorContext,
  ): Promise<ErrorEventAssignmentListResponse> {
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
    const items = this.repo
      .listAssignmentsByFingerprint(rec.fingerprint, rec.tenantId)
      .map(toErrorEventAssignment);
    return {
      fingerprint: rec.fingerprint,
      items,
      total: items.length,
    };
  }

  // -------------------------------------------------------------------------
  // Birleşik audit log — GOAL-104
  // -------------------------------------------------------------------------

  /**
   * Bir fingerprint için tüm aksiyonları (status transition + not +
   * destek bağlantısı + atama) occurredAt artan sırada birleşik
   * timeline olarak döner. Sistem kaynaklı otomatik `reopened`
   * terfileri de dahildir (occurrence_recorded action'ı).
   *
   * `details` alanı aksiyona göre farklı şekil alır; UI
   * `action` discriminator'ı ile render eder.
   *
   * İzin: yalnızca SUPERADMIN (audit:log:read).
   */
  public async listErrorEventAuditLog(
    id: string,
    actor: ActorContext,
  ): Promise<ErrorEventAuditLogResponse> {
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
    const entries: ErrorEventAuditEntry[] = [];
    // Status transitions.
    for (const t of this.repo.listTransitionsByFingerprint(rec.fingerprint, rec.tenantId)) {
      entries.push({
        id: t.id,
        fingerprint: t.fingerprint,
        action: "status_transition",
        occurredAt: t.occurredAt,
        actorId: t.actorId,
        actorType: t.actorType,
        details: {
          fromStatus: t.fromStatus,
          toStatus: t.toStatus,
          reason: t.reason,
        },
      });
    }
    // Notlar.
    for (const n of this.repo.listNotesByFingerprint(rec.fingerprint, rec.tenantId)) {
      entries.push({
        id: n.id,
        fingerprint: n.fingerprint,
        action: "note_added",
        occurredAt: n.createdAt,
        actorId: n.authorId,
        actorType: n.authorType,
        details: {
          noteId: n.id,
          visibility: n.visibility,
          bodyPreview: n.body.slice(0, 200),
        },
      });
    }
    // Destek bağlantıları.
    for (const s of this.repo.listSupportLinksByFingerprint(rec.fingerprint, rec.tenantId)) {
      entries.push({
        id: s.id,
        fingerprint: s.fingerprint,
        action: "support_link_added",
        occurredAt: s.createdAt,
        actorId: s.createdById,
        actorType: s.createdByType,
        details: {
          supportLinkId: s.id,
          system: s.system,
          externalId: s.externalId,
          url: s.url,
          title: s.title,
        },
      });
    }
    // Atamalar.
    for (const a of this.repo.listAssignmentsByFingerprint(rec.fingerprint, rec.tenantId)) {
      const unassigned = a.assigneeId === UNASSIGNED;
      entries.push({
        id: a.id,
        fingerprint: a.fingerprint,
        action: "assignment_changed",
        occurredAt: a.assignedAt,
        actorId: a.assignedById,
        actorType: a.assignedByType,
        details: {
          assignmentId: a.id,
          assigneeId: unassigned ? null : a.assigneeId,
          unassigned,
          reason: a.reason,
        },
      });
    }
    // resolved → reopened otomatik terfiler (resolved-status görünce
    // occurrence_recorded olarak yeniden yazılır).
    for (const t of this.repo.listTransitionsByFingerprint(rec.fingerprint, rec.tenantId)) {
      if (t.toStatus === "reopened" && t.actorId === "system") {
        entries.push({
          id: `${t.id}-occ`,
          fingerprint: t.fingerprint,
          action: "occurrence_recorded",
          occurredAt: t.occurredAt,
          actorId: t.actorId,
          actorType: t.actorType,
          details: { transitionId: t.id, reason: t.reason },
        });
      }
    }
    entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return {
      fingerprint: rec.fingerprint,
      items: entries,
      total: entries.length,
    };
  }

  // -------------------------------------------------------------------------
  // String sanitizer (notlar için)
  // -------------------------------------------------------------------------

  /**
   * String'i PII mask'ler ve uzunluk sınırı uygular. Boş
   * string veya mask sonrası boşalan içerik null döner.
   */
  private maskString(s: string, maxLen: number): string | null {
    if (typeof s !== "string") return null;
    const trimmed = s.trim();
    if (!trimmed) return null;
    let masked: string;
    try {
      masked = this.masker.maskString(trimmed) ?? trimmed;
    } catch {
      masked = trimmed;
    }
    return masked.slice(0, maxLen);
  }
}

// Type re-export — testler için.
export type { ErrorEventStatusTransitionRecord };
