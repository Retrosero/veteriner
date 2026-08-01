/**
 * @file Vaccine card (aşı kartı) service.
 * @module apps/api/modules/vaccines/vaccine-cards.service
 *
 * @description GOAL-052 aşı kartı iş kuralları. Bir hastanın
 * tüm aşı takvimini derler; personel paneli ve portal için
 * tek kaynak. Portal görünürlüğü tenant ayarına bağlıdır.
 *
 * İş kuralları:
 * - `getVaccineCard`:
 *   - patient aynı tenant'ta mı (cross-tenant → 404 VET-CLINIC-0001).
 *   - uygulanabilir protokoller: species uyumlu (`'all'` veya
 *     eşleşen tür). `Patient.species='other'` ise tüm
 *     protokoller uygulanabilir (klinik politikası: tür
 *     bilinmiyor → tüm takvimler).
 *   - her uygulanabilir protokol için tüm uygulamalar (iptal
 *     dahil) toplanır, status çözümlenir.
 *   - summary: overdue / upcoming / completed / not_started
 *     sayıları.
 *   - portalVisible: tenant ayarı `portalVaccineCardEnabled`
 *     (default = true).
 * - `getPortalVaccineCard`:
 *   - patient aynı tenant'ta mı (cross-tenant → 404 VET-CLINIC-0001).
 *   - tenant portal ayarı kapalıysa → 403 VET-AUTHZ-0002.
 *   - getVaccineCard ile aynı kartı döner.
 * - `getPortalSetting` / `updatePortalSetting`:
 *   - tenant-scoped tek satır ayar.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *
 * @since GOAL-052 (FAZ-5) aşı kartı core
 */

import { Injectable, Logger } from "@nestjs/common";

import { VaccineApplicationsService } from "./vaccine-applications.service.js";
import { VaccineCardsRepository } from "./vaccine-cards.repository.js";
import { VaccinesService } from "./vaccines.service.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { toVaccineApplication } from "../../common/vaccines/vaccine-application.types.js";
import {
  buildCardEntry,
  defaultCardOptions,
  todayUtcIso,
} from "../../common/vaccines/vaccine-card.types.js";
import { toVaccineProtocol } from "../../common/vaccines/vaccine.types.js";
import { PatientsService } from "../patients/patients.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  TenantVaccineCardPortalSetting,
  TenantVaccineCardPortalSettingInput,
  VaccineCard,
  VaccineCardOptions,
} from "@vetniva/contracts";

@Injectable()
export class VaccineCardsService {
  private readonly logger = new Logger(VaccineCardsService.name);

  public constructor(
    private readonly patients: PatientsService,
    private readonly vaccines: VaccinesService,
    private readonly applications: VaccineApplicationsService,
    private readonly settings: VaccineCardsRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // getVaccineCard (personel)
  // -------------------------------------------------------------------------

  public async getVaccineCard(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
    options?: VaccineCardOptions,
  ): Promise<VaccineCard> {
    this.requireTenantScope(actor, tenantId);

    const patient = await this.patients.findById(tenantId, patientId, actor);
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { patientId },
      });
    }

    const card = await this.computeCard(
      tenantId,
      patient,
      actor,
      options ?? defaultCardOptions(),
    );
    return card;
  }

  // -------------------------------------------------------------------------
  // getPortalVaccineCard (portal)
  // -------------------------------------------------------------------------

  public async getPortalVaccineCard(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
    options?: VaccineCardOptions,
  ): Promise<VaccineCard> {
    this.requireTenantScope(actor, tenantId);

    const setting = this.settings.getOrDefault(tenantId, true);
    if (!setting.portalVaccineCardEnabled) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Portal aşı kartı görünürlüğü kapatılmış",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-AUTHZ-0002",
        details: { tenantId, feature: "portalVaccineCardEnabled" },
      });
    }

    const patient = await this.patients.findById(tenantId, patientId, actor);
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { patientId },
      });
    }

    return this.computeCard(
      tenantId,
      patient,
      actor,
      options ?? defaultCardOptions(),
    );
  }

  // -------------------------------------------------------------------------
  // Tenant portal ayarı
  // -------------------------------------------------------------------------

  public async getPortalSetting(
    tenantId: string,
    actor: ActorContext,
  ): Promise<TenantVaccineCardPortalSetting> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.settings.getOrDefault(tenantId, true);
    return this.settings.toPublic(rec);
  }

  public async updatePortalSetting(
    tenantId: string,
    input: TenantVaccineCardPortalSettingInput,
    actor: ActorContext,
  ): Promise<TenantVaccineCardPortalSetting> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.settings.upsert({
      tenantId,
      portalVaccineCardEnabled: input.portalVaccineCardEnabled,
    });

    await this.audit.recordSimple(
      "audit:vaccine.card.portal_setting.update",
      "tenant_vaccine_card_setting",
      tenantId,
      "update",
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        correlationId: actor.correlationId,
        country: "TR",
      },
      "info",
      {
        portalVaccineCardEnabled: input.portalVaccineCardEnabled,
      },
    );

    return this.settings.toPublic(rec);
  }

  // -------------------------------------------------------------------------
  // Compute (ortak)
  // -------------------------------------------------------------------------

  private async computeCard(
    tenantId: string,
    patient: {
      id: string;
      species: "dog" | "cat" | "bird" | "other";
      birthDate: string | null;
    },
    actor: ActorContext,
    options: VaccineCardOptions,
  ): Promise<VaccineCard> {
    const referenceDate = options.referenceDate ?? todayUtcIso();

    // 1) Uygulanabilir protokoller.
    //    Patient.species = 'other' ise tüm protokoller; aksi
    //    halde species eşleşmesi veya 'all'.
    const allProtocolsResp = await this.vaccines.listProtocols(
      tenantId,
      { limit: 200, offset: 0 },
      actor,
    );
    const applicable = allProtocolsResp.items.filter((p) => {
      if (patient.species === "other") return true;
      return p.species === "all" || p.species === patient.species;
    });

    // 2) Hastanın tüm uygulamalarını tek seferde çek.
    const apps = await this.applications.listByPatient(
      tenantId,
      patient.id,
      actor,
      500,
    );

    // 3) Her protokol için entry.
    const entries = applicable
      .map((protocol) => {
        const matched = apps.filter((a) => a.protocolId === protocol.id);
        return buildCardEntry({
          protocol,
          applications: matched,
          patientBirthDate: patient.birthDate,
          options,
          referenceDate,
        });
      })
      .sort((a, b) => {
        // Önce overdue, sonra upcoming, sonra not_started, sonra completed.
        const order: Record<typeof a.status, number> = {
          overdue: 0,
          upcoming: 1,
          not_started: 2,
          completed: 3,
        };
        const diff = (order[a.status] ?? 99) - (order[b.status] ?? 99);
        if (diff !== 0) return diff;
        return a.protocol.name.localeCompare(b.protocol.name);
      });

    // 4) Summary.
    const summary = {
      overdue: entries.filter((e) => e.status === "overdue").length,
      upcoming: entries.filter((e) => e.status === "upcoming").length,
      completed: entries.filter((e) => e.status === "completed").length,
      notStarted: entries.filter((e) => e.status === "not_started").length,
    };

    const setting = this.settings.getOrDefault(tenantId, true);

    return {
      patientId: patient.id,
      tenantId,
      species: patient.species,
      computedAt: new Date().toISOString(),
      portalVisible: setting.portalVaccineCardEnabled,
      entries,
      summary,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

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

/** Internal export: re-export helpers to keep test surface stable. */
export const __vaccineCardHelpers = {
  toVaccineApplication,
  toVaccineProtocol,
};
