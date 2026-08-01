/**
 * @file Portal appointments controller.
 * @module apps/api/modules/portal-appointments/portal-appointments.controller
 *
 * @description GOAL-035 hasta sahibi portal — online randevu talebi HTTP
 * endpoint'leri. İki controller path grubu:
 *
 * Portal (PET_OWNER_PORTAL, `PortalSessionGuard`):
 * - `POST /api/v1/portal-appointments/requests`            — Yeni talep
 * - `GET  /api/v1/portal-appointments/requests`            — Taleplerim
 * - `POST /api/v1/portal-appointments/requests/:id/cancel` — İptal
 *
 * Klinik personeli (`PermissionsGuard` + `RequirePermissions`):
 * - `POST /api/v1/clinic/portal-appointments/requests/:id/approve` — Onay
 * - `POST /api/v1/clinic/portal-appointments/requests/:id/reject`  — Red
 *
 * @security Tenant bilgisi session/actor'dan alınır; URL'de taşınmaz.
 *   Portal endpoint'leri `PortalSessionGuard` ile korunur (cookie
 *   veya `Authorization: Bearer`); staff endpoint'leri personel auth +
 *   permission decorator'ı ile korunur.
 *
 * @since GOAL-035 (FAZ-3) online randevu talebi core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  appointmentRequestCreateInputSchema,
  appointmentRequestRejectInputSchema,
} from "@vetniva/contracts";

import { PortalAppointmentsService } from "./portal-appointments.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { Public } from "../../common/decorators/public.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { PortalSessionGuard } from "../portal-auth/portal-session.guard.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  Appointment,
  AppointmentRequest,
  AppointmentRequestCreateInput,
  AppointmentRequestListResponse,
  AppointmentRequestRejectInput,
} from "@vetniva/contracts";
import type { Request } from "express";

/** Portal session guard sonrası set edilen request augmentation. */
interface PortalSessionRequest {
  portalSession?: {
    portalUserId: string;
    tenantId: string;
    sessionToken: string;
    expiresAt: string;
  };
}

@Public()
@Controller("api/v1/portal-appointments")
@UseGuards(PortalSessionGuard)
export class PortalAppointmentsPortalController {
  public constructor(private readonly service: PortalAppointmentsService) {}

  /**
   * Yeni randevu talebi oluşturur. Owner/patient doğrulaması
   * service.create içinde.
   */
  @Post("requests")
  @HttpCode(HttpStatus.CREATED)
  public async create(
    @Body(new ZodValidationPipe(appointmentRequestCreateInputSchema))
    body: AppointmentRequestCreateInput,
    @Req() request: Request & PortalSessionRequest,
  ): Promise<AppointmentRequest> {
    const { portalUserId, tenantId } = this.requireSession(request);
    return this.service.create(
      tenantId,
      portalUserId,
      body,
      this.portalActorFor(request, tenantId),
    );
  }

  /** Portal kullanıcısının kendi talepleri. */
  @Get("requests")
  public async list(
    @Req() request: Request & PortalSessionRequest,
  ): Promise<AppointmentRequestListResponse> {
    const { portalUserId, tenantId } = this.requireSession(request);
    const items = await this.service.list(
      tenantId,
      portalUserId,
      this.portalActorFor(request, tenantId),
    );
    return { items, total: items.length };
  }

  /** Talebi iptal eder (yalnızca sahibi). */
  @Post("requests/:id/cancel")
  @HttpCode(HttpStatus.OK)
  public async cancel(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() request: Request & PortalSessionRequest,
  ): Promise<{ cancelled: true }> {
    const { portalUserId, tenantId } = this.requireSession(request);
    await this.service.cancel(
      tenantId,
      portalUserId,
      id,
      this.portalActorFor(request, tenantId),
    );
    return { cancelled: true };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private requireSession(request: Request & PortalSessionRequest): {
    portalUserId: string;
    tenantId: string;
  } {
    const session = request.portalSession;
    if (!session) {
      throw new Error("Portal session context missing");
    }
    return {
      portalUserId: session.portalUserId,
      tenantId: session.tenantId,
    };
  }

  private portalActorFor(request: Request, tenantId: string): ActorContext {
    const ip = request.header("x-forwarded-for") ?? null;
    const ua = request.header("user-agent") ?? null;
    return {
      actorId: null,
      actorType: "portal_user",
      role: "PET_OWNER_PORTAL",
      tenantId,
      branchId: null,
      isSuperadmin: false,
      correlationId: `req-portal-${Date.now()}`,
      ipAddress: ip ? (ip.split(",")[0]?.trim() ?? null) : null,
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

@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/portal-appointments/requests")
export class PortalAppointmentsClinicController {
  public constructor(private readonly service: PortalAppointmentsService) {}

  /**
   * Personel talebi onaylar. `clinic:appointment:create` gerekir
   * (approve yeni randevu oluşturur).
   */
  @Post(":id/approve")
  @RequirePermissions("clinic:appointment:create")
  @HttpCode(HttpStatus.OK)
  public async approve(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ request: AppointmentRequest; appointment: Appointment }> {
    const tenantId = this.requireTenant(actor);
    const decidedBy = actor.actorId ?? "system";
    const result = await this.service.approve(tenantId, id, decidedBy, actor);
    const appointment = await this.service.findAppointmentById(
      tenantId,
      result.appointmentId,
      actor,
    );
    if (!appointment) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Randevu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return { request: result.request, appointment };
  }

  /**
   * Personel talebi reddeder. `clinic:appointment:create` (approve ile
   * aynı kategori) gerekir; reason zorunlu.
   */
  @Post(":id/reject")
  @RequirePermissions("clinic:appointment:create")
  @HttpCode(HttpStatus.OK)
  public async reject(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(appointmentRequestRejectInputSchema))
    body: AppointmentRequestRejectInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ rejected: true }> {
    const tenantId = this.requireTenant(actor);
    const decidedBy = actor.actorId ?? "system";
    await this.service.reject(tenantId, id, decidedBy, body.reason, actor);
    return { rejected: true };
  }

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
