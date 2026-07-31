/**
 * @file Vaccine card (aşı kartı) controller.
 * @module apps/api/modules/vaccines/vaccine-cards.controller
 *
 * @description GOAL-052 aşı kartı REST API. Personel paneli
 * (PermissionsGuard + tenant scope) ve hasta sahibi portalı
 * (PortalSessionGuard) için iki ayrı kök.
 *
 * Endpoint'ler (personel):
 * - `GET  /api/v1/clinic/vaccines/cards/patient/:patientId`
 *   — Hastanın aşı kartı (özet + tüm entry'ler).
 * - `GET  /api/v1/clinic/vaccines/cards/portal-setting`
 *   — Tenant portal ayarı.
 * - `PUT  /api/v1/clinic/vaccines/cards/portal-setting`
 *   — Tenant portal ayarını güncelle.
 *
 * Endpoint'ler (portal):
 * - `GET  /api/v1/portal/vaccines/cards/patient/:patientId`
 *   — Hastanın aşı kartı (tenant ayarına bağlı; ayar
 *     kapalıysa 403 VET-AUTHZ-0002).
 *
 * @since GOAL-052 (FAZ-5) aşı kartı core
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import type {
  TenantVaccineCardPortalSetting,
  TenantVaccineCardPortalSettingInput,
  VaccineCard,
} from "@vetniva/contracts";
import { tenantVaccineCardPortalSettingInputSchema } from "@vetniva/contracts";

import { PortalSessionGuard } from "../portal-auth/portal-session.guard.js";
import { VaccineCardsService } from "./vaccine-cards.service.js";

/** Portal session guard sonrası set edilen request augmentation. */
interface PortalSessionRequest {
  portalSession?: {
    portalUserId: string;
    tenantId: string;
    sessionToken: string;
    expiresAt: string;
  };
}

@ApiTags("vaccines")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic")
export class VaccineCardsController {
  public constructor(private readonly service: VaccineCardsService) {}

  // -------------------------------------------------------------------------
  // Personel — kart
  // -------------------------------------------------------------------------

  @Get("vaccines/cards/patient/:patientId")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineCardGet",
    summary: "Hastanın aşı kartını getir",
    description:
      "Hastanın tüm uygulanabilir protokolleri için aşı kartı " +
      "döner: aşı geçmişi, sonraki tarih, durum (overdue / " +
      "upcoming / completed / not_started), uygulayan " +
      "veteriner, lot. Cross-tenant patientId → 404 " +
      "VET-CLINIC-0001. Hesaplama referans tarihi default = " +
      "şu an (UTC).",
  })
  @ApiResponse({ status: 200, description: "Aşı kartı." })
  @ApiResponse({ status: 404, description: "Hayvan bulunamadı." })
  public async getCard(
    @Param("patientId") patientId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<VaccineCard> {
    const tenantId = this.requireTenant(actor);
    return this.service.getVaccineCard(tenantId, patientId, actor);
  }

  // -------------------------------------------------------------------------
  // Personel — tenant portal ayarı
  // -------------------------------------------------------------------------

  @Get("vaccines/cards/portal-setting")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineCardPortalSettingGet",
    summary: "Tenant portal aşı kartı ayarı",
    description:
      "Tenant için `portalVaccineCardEnabled` bayrağını döner. " +
      "Kayıt yoksa default true döner.",
  })
  public async getSetting(
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantVaccineCardPortalSetting> {
    const tenantId = this.requireTenant(actor);
    return this.service.getPortalSetting(tenantId, actor);
  }

  @Put("vaccines/cards/portal-setting")
  @RequirePermissions("clinic:vaccination:read")
  @ApiOperation({
    operationId: "vaccineCardPortalSettingUpdate",
    summary: "Tenant portal aşı kartı ayarını güncelle",
    description:
      "Tenant için `portalVaccineCardEnabled` bayrağını yazar. " +
      "Ayar kapatılırsa portal endpoint'i 403 VET-AUTHZ-0002 " +
      "döner. Audit `audit:vaccine.card.portal_setting.update` " +
      "(info).",
  })
  public async updateSetting(
    @Body(new ZodValidationPipe(tenantVaccineCardPortalSettingInputSchema))
    body: TenantVaccineCardPortalSettingInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<TenantVaccineCardPortalSetting> {
    const tenantId = this.requireTenant(actor);
    return this.service.updatePortalSetting(tenantId, body, actor);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private requireTenant(actor: ActorContext): string {
    if (actor.tenantId) return actor.tenantId;
    throw new DomainError({
      errorCode: "VET-TENANT-0001",
      message: "Tenant bağlamı zorunlu",
      httpStatus: 400,
      severity: "warning",
      i18nKey: "error.VET-TENANT-0001",
    });
  }
}

/**
 * Portal aşı kartı controller. Personel auth'undan tamamen
 * ayrı; `PortalSessionGuard` ile korunur. Tenant bilgisi
 * session'dan alınır.
 *
 * @since GOAL-052 (FAZ-5) aşı kartı core (portal kökü)
 */
@ApiTags("vaccines-portal")
@UseGuards(PortalSessionGuard)
@Controller("api/v1/portal/vaccines")
export class PortalVaccineCardsController {
  public constructor(private readonly service: VaccineCardsService) {}

  @Get("cards/patient/:patientId")
  @ApiOperation({
    operationId: "vaccineCardPortalGet",
    summary: "Portal: hastanın aşı kartı",
    description:
      "Portal session'ın tenant'ı için kartı döner. Tenant " +
      "ayarı `portalVaccineCardEnabled=false` ise 403 " +
      "VET-AUTHZ-0002.",
  })
  public async getCard(
    @Param("patientId") patientId: string,
    @Req() request: Request & PortalSessionRequest,
  ): Promise<VaccineCard> {
    const { tenantId } = this.requireSession(request);
    const actor = this.actorFor(request, tenantId);
    return this.service.getPortalVaccineCard(tenantId, patientId, actor);
  }

  private requireSession(
    request: Request & PortalSessionRequest,
  ): { portalUserId: string; tenantId: string } {
    const session = request.portalSession;
    if (!session) {
      throw new Error("Portal session context missing");
    }
    return {
      portalUserId: session.portalUserId,
      tenantId: session.tenantId,
    };
  }

  private actorFor(
    request: Request,
    tenantId: string,
  ): ActorContext {
    const ip =
      (request.header("x-forwarded-for") as string | undefined) ?? null;
    const ua = request.header("user-agent") ?? null;
    return {
      actorId: null,
      actorType: "portal_user",
      role: "PET_OWNER_PORTAL",
      tenantId,
      branchId: null,
      isSuperadmin: false,
      correlationId: `req-portal-${Date.now()}`,
      ipAddress: ip ? ip.split(",")[0]?.trim() ?? null : null,
      userAgentHash: ua ? this.hashUa(ua) : null,
      source: "portal_session",
    };
  }

  private hashUa(ua: string): string {
    let hash = 2166136261;
    for (let i = 0; i < ua.length; i++) {
      hash ^= ua.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 16);
  }
}
