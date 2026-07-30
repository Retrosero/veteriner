/**
 * @file Portal pets controller.
 * @module apps/api/modules/portal-pets/portal-pets.controller
 *
 * @description GOAL-034 hasta sahibi portal — kendi hayvanlarını
 * listeleme ve detayı için HTTP endpoint'leri. Personel auth'undan
 * tamamen ayrı bir auth path; `PortalSessionGuard` ile korunur.
 *
 * Endpoint'ler:
 * - `GET /api/v1/portal-pets`       — Aktif hayvanların listesi
 * - `GET /api/v1/portal-pets/:id`   — Tek hayvan detayı
 *
 * @security
 * - Auth: `PortalSessionGuard` (cookie veya `Authorization: Bearer`
 *   header'dan portal session token okur). Cross-portal-user
 *   erişim yok; controller `request.portalSession`'tan
 *   `portalUserId` alır.
 * - Tenant bilgisi session'dan gelir; URL'de taşınmaz.
 *
 * @since GOAL-034 (FAZ-3) portal hayvan listesi ve detayı
 */

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  PortalPetDetail,
  PortalPetSummary,
} from "@vetniva/contracts";

import { PortalSessionGuard } from "../portal-auth/portal-session.guard.js";

import { PortalPetsService } from "./portal-pets.service.js";

/** Portal session guard sonrası set edilen request augmentation. */
interface PortalSessionRequest {
  portalSession?: {
    portalUserId: string;
    tenantId: string;
    sessionToken: string;
    expiresAt: string;
  };
}

@Controller("api/v1/portal-pets")
@UseGuards(PortalSessionGuard)
export class PortalPetsController {
  public constructor(private readonly service: PortalPetsService) {}

  /**
   * GET /api/v1/portal-pets — aktif hayvan listesi. Opsiyonel
   * ileride `?species=...` filtresi eklenebilir.
   */
  @Get()
  public async list(
    @Req() request: Request & PortalSessionRequest,
  ): Promise<{ items: PortalPetSummary[]; total: number }> {
    const { portalUserId, tenantId } = this.requireSession(request);
    const items = await this.service.list(
      tenantId,
      portalUserId,
      this.actorFor(request, tenantId),
    );
    return { items, total: items.length };
  }

  /**
   * GET /api/v1/portal-pets/:id — tek hayvan detayı. Cross-tenant,
   * archived, veya başka owner'ın hayvanı → 404 VET-CLINIC-0001.
   */
  @Get(":id")
  public async getDetail(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() request: Request & PortalSessionRequest,
  ): Promise<PortalPetDetail> {
    const { portalUserId, tenantId } = this.requireSession(request);
    return this.service.getDetail(
      tenantId,
      portalUserId,
      id,
      this.actorFor(request, tenantId),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private requireSession(
    request: Request & PortalSessionRequest,
  ): { portalUserId: string; tenantId: string } {
    const session = request.portalSession;
    if (!session) {
      // Guard 401 fırlatır; bu satıra ulaşılmaz.
      throw new Error("Portal session context missing");
    }
    return {
      portalUserId: session.portalUserId,
      tenantId: session.tenantId,
    };
  }

  /**
   * Portal session'dan ActorContext üretir. Personnel
   * `ActorContextService` ile aynı şekil; `actorType: "portal_user"`
   * ve `source: "portal_session"` ile ayırt edilir.
   */
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
    // PII masker ile aynı FNV-1a 32-bit (test/prod uyumlu).
    let hash = 2166136261;
    for (let i = 0; i < ua.length; i++) {
      hash ^= ua.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 16);
  }
}
