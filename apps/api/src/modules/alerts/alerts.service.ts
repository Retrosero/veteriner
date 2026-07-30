/**
 * @file Alerts service.
 * @module apps/api/modules/alerts/alerts.service
 *
 * @description GOAL-023 alerji, kronik durum, ilaç etkileşimi ve
 * davranış uyarıları iş kuralları. Tenant-scoped, append-only
 * mantıkta; arşivleme soft delete. In-memory Map'te tutulur.
 *
 * İş kuralları:
 * - add: patient aynı tenant'ta mı (cross-tenant → 404
 *   VET-AUTHZ-0002); severity `critical` ise audit
 *   `audit:alert.create` (info).
 * - listForPatient: tenant-scoped, severity filtresi, opsiyonel
 *   activeOnly (expiresAt>now veya null).
 * - getActiveAlertsForPatient: yalnızca aktif, severity'ye göre
 *   azalan (critical > warning > info).
 * - archive: soft delete (archivedAt set), audit
 *   `audit:alert.archive` (info). İdempotent.
 * - checkMedicationConflict: allergy veya chronic_condition
 *   uyarısının başlık/açıklamasında ilaç adı geçiyorsa eşleşen
 *   uyarıları döner (case-insensitive substring).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *
 * @since GOAL-023 (FAZ-2) alerji/kronik uyarılar core
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  PatientsRepository,
  type PatientRecord,
} from "../patients/patients.repository.js";
import type { AlertRecord, AlertInput, AlertFilters } from "../../common/alerts/alert.types.js";

/** Severity sıralaması için weight (büyük = daha acil). */
const SEVERITY_WEIGHT: Readonly<Record<string, number>> = {
  info: 0,
  warning: 1,
  critical: 2,
};

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  /** key: alertId → AlertRecord. */
  private readonly byId = new Map<string, AlertRecord>();

  public constructor(
    private readonly patients: PatientsRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Yeni uyarı oluşturur. Patient aynı tenant'ta değilse 404.
   * Severity `critical` ise audit (info) yayınlanır; diğer
   * severity'lerde audit yayınlanmaz (klinik akışta gürültüyü
   * azaltmak için).
   */
  public async add(
    tenantId: string,
    patientId: string,
    input: AlertInput,
    actor: ActorContext,
  ): Promise<AlertRecord> {
    this.requireTenantScope(actor, tenantId);

    // 1) Patient tenant-scoped doğrulama.
    const patient = this.patients.findById(tenantId, patientId);
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-AUTHZ-0002",
        details: { patientId },
      });
    }

    const id = this.nextId(tenantId);
    const now = new Date().toISOString();
    const record: AlertRecord = {
      id,
      tenantId,
      patientId,
      category: input.category,
      severity: input.severity,
      title: input.title,
      description: input.description,
      createdAt: now,
      createdBy: actor.actorId,
      expiresAt: input.expiresAt ?? null,
      archivedAt: null,
    };
    this.byId.set(id, record);

    // 2) Audit: yalnızca critical uyarılar loglanır (gürültü kontrolü).
    if (record.severity === "critical") {
      await this.audit.record({
        eventName: "audit:alert.create",
        tenantId,
        actorId: actor.actorId,
        actorType: actor.actorType,
        targetType: "alert",
        targetId: id,
        action: "create",
        correlationId: actor.correlationId,
        country: "TR",
        severity: "info",
        ipAddress: actor.ipAddress,
        userAgentHash: actor.userAgentHash,
        after: {
          patientId,
          category: record.category,
          severity: record.severity,
          title: record.title,
        },
        metadata: { source: actor.source },
      });
    }

    return record;
  }

  /**
   * Tenant-scoped liste. `activeOnly=true` ise `archivedAt=null`
   * VE (`expiresAt=null` VEYA `expiresAt>now`).
   */
  public listForPatient(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
    filters: AlertFilters = {},
  ): AlertRecord[] {
    this.requireTenantScope(actor, tenantId);

    const all: AlertRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.patientId !== patientId) continue;
      if (filters.severity && rec.severity !== filters.severity) continue;
      if (filters.activeOnly && !this.isActive(rec)) continue;
      all.push(rec);
    }
    // En yeni üstte.
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all;
  }

  /**
   * Aktif uyarılar (archivedAt=null, expiresAt>now veya null),
   * severity'ye göre azalan (critical > warning > info).
   * Muayene/reçete oluşturma sırasında UI için yardımcı.
   */
  public getActiveAlertsForPatient(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): AlertRecord[] {
    this.requireTenantScope(actor, tenantId);
    const active = this.listForPatient(
      tenantId,
      patientId,
      actor,
      { activeOnly: true },
    );
    return active.sort((a, b) => {
      const w = (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0);
      if (w !== 0) return w;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  /**
   * Reçete oluştururken ilaç adıyla bilinen alerji/kronik
   * durum uyarılarını döner. Case-insensitive substring match
   * yapar (title + description üzerinde).
   */
  public checkMedicationConflict(
    tenantId: string,
    patientId: string,
    medicationName: string,
    actor: ActorContext,
  ): AlertRecord[] {
    this.requireTenantScope(actor, tenantId);
    const needle = medicationName.trim().toLowerCase();
    if (needle.length === 0) return [];

    const active = this.getActiveAlertsForPatient(tenantId, patientId, actor);
    return active.filter(
      (a) =>
        (a.category === "allergy" || a.category === "chronic_condition") &&
        (a.title.toLowerCase().includes(needle) ||
          a.description.toLowerCase().includes(needle)),
    );
  }

  /**
   * Soft delete: archivedAt set. İdempotent (zaten arşivliyse
   * no-op). Audit `audit:alert.archive` (info) yayınlanır.
   */
  public async archive(
    tenantId: string,
    alertId: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);

    const rec = this.byId.get(alertId);
    if (!rec || rec.tenantId !== tenantId) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0010",
        message: "Uyarı bulunamadı",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-CLINIC-0010",
        details: { alertId },
      });
    }
    if (rec.archivedAt !== null) {
      return; // idempotent
    }
    const at = new Date().toISOString();
    rec.archivedAt = at;
    this.byId.set(alertId, rec);

    await this.audit.record({
      eventName: "audit:alert.archive",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "alert",
      targetId: alertId,
      action: "archive",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { archivedAt: null },
      after: { archivedAt: at },
      metadata: {
        patientId: rec.patientId,
        category: rec.category,
        source: actor.source,
      },
    });
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
  }

  private isActive(rec: AlertRecord): boolean {
    if (rec.archivedAt !== null) return false;
    if (rec.expiresAt === null) return true;
    return rec.expiresAt > new Date().toISOString();
  }

  private nextId(tenantId: string): string {
    return `alt-${tenantId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  }

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }
}
