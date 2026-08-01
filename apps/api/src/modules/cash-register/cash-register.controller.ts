/**
 * @file CashRegister (kasa ve gün sonu) controller.
 * @module apps/api/modules/cash-register/cash-register.controller
 * @description GOAL-074 (FAZ-7) kasa ve gün sonu REST API.
 *   Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST  /api/v1/cash-register/sessions`             — açılış
 * - `GET   /api/v1/cash-register/sessions`             — liste
 * - `GET   /api/v1/cash-register/sessions/current`     — açık oturum
 * - `GET   /api/v1/cash-register/sessions/:id`         — detay
 * - `POST  /api/v1/cash-register/sessions/:id/close`   — kapanış
 * - `POST  /api/v1/cash-register/sessions/:id/reopen`  — yeniden açma
 * - `GET   /api/v1/cash-register/sessions/:id/movements` — hareketler
 * - `GET   /api/v1/cash-register/sessions/:id/summary`   — özet + variance.
 * @since GOAL-074 (FAZ-7) kasa ve gün sonu core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  cashRegisterSessionCloseInputSchema,
  cashRegisterSessionFiltersSchema,
  cashRegisterSessionOpenInputSchema,
  cashRegisterSessionReopenInputSchema,
  type CashRegisterMovementListResponse,
  type CashRegisterSession,
  type CashRegisterSessionCloseInput,
  type CashRegisterSessionFilters,
  type CashRegisterSessionListResponse,
  type CashRegisterSessionOpenInput,
  type CashRegisterSessionReopenInput,
  type CashRegisterSessionSummary,
} from "@vetniva/contracts";

import { CashRegisterService } from "./cash-register.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("cash-register")
@UseGuards(PermissionsGuard)
@Controller("api/v1/cash-register")
export class CashRegisterController {
  public constructor(private readonly service: CashRegisterService) {}

  @Post("sessions")
  @RequirePermissions("cash_register:session:open")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cashRegisterSessionOpen",
    summary: "Kasa oturumu aç",
    description:
      "Bir şube için yeni kasa oturumu açar. Şubede zaten açık " +
      "oturum varsa 409 döner. Audit audit:cash_register.session.open.",
  })
  public async open(
    @Body(new ZodValidationPipe(cashRegisterSessionOpenInputSchema))
    body: CashRegisterSessionOpenInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CashRegisterSession> {
    const tenantId = this.requireTenant(actor);
    return this.service.openSession(tenantId, body, actor);
  }

  @Get("sessions")
  @RequirePermissions("cash_register:session:read")
  @ApiOperation({
    operationId: "cashRegisterSessionList",
    summary: "Kasa oturumlarını listele",
    description:
      "Tenant-scope filtreli oturum listesi. branchId, status, " +
      "openedOnDate (YYYY-MM-DD) filtreleri opsiyonel.",
  })
  public async list(
    @Query(new ZodValidationPipe(cashRegisterSessionFiltersSchema))
    query: CashRegisterSessionFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<CashRegisterSessionListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listSessions(tenantId, query, actor);
  }

  @Get("sessions/current")
  @RequirePermissions("cash_register:session:read")
  @ApiOperation({
    operationId: "cashRegisterSessionCurrent",
    summary: "Şubenin açık kasa oturumu",
    description:
      "branchId query param ile belirtilen şubenin açık oturumunu " +
      "döner. Açık oturum yoksa null döner.",
  })
  public async current(
    @Query("branchId", new ParseUUIDPipe()) branchId: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<CashRegisterSession | null> {
    const tenantId = this.requireTenant(actor);
    return this.service.getCurrentOpenSession(tenantId, branchId, actor);
  }

  @Get("sessions/:id")
  @RequirePermissions("cash_register:session:read")
  @ApiOperation({
    operationId: "cashRegisterSessionDetail",
    summary: "Kasa oturumu detayı",
    description: "Tek bir oturumun meta verisi. Cross-tenant → 404.",
  })
  public async detail(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<CashRegisterSession> {
    const tenantId = this.requireTenant(actor);
    const session = await this.service.getSessionDetail(tenantId, id, actor);
    if (!session) {
      throw new NotFoundException("Kasa oturumu bulunamadı");
    }
    return session;
  }

  @Post("sessions/:id/close")
  @RequirePermissions("cash_register:session:close")
  @ApiOperation({
    operationId: "cashRegisterSessionClose",
    summary: "Kasa oturumunu kapat",
    description:
      "Gerçek nakit sayımı (closingBalance) ile oturumu kapatır. " +
      "Beklenen bakiye = opening + sum(movements); variance = " +
      "closing - expected. Audit audit:cash_register.session.close.",
  })
  public async close(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(cashRegisterSessionCloseInputSchema))
    body: CashRegisterSessionCloseInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CashRegisterSession> {
    const tenantId = this.requireTenant(actor);
    return this.service.closeSession(tenantId, id, body, actor);
  }

  @Post("sessions/:id/reopen")
  @RequirePermissions("cash_register:session:reopen")
  @ApiOperation({
    operationId: "cashRegisterSessionReopen",
    summary: "Kasa oturumunu yeniden aç",
    description:
      "Kapatılmış oturumu OWNER yetkisi ile yeniden açar. " +
      "originalClosedAt korunur. Audit audit:cash_register." +
      "session.reopen (warning).",
  })
  public async reopen(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(cashRegisterSessionReopenInputSchema))
    body: CashRegisterSessionReopenInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CashRegisterSession> {
    const tenantId = this.requireTenant(actor);
    return this.service.reopenSession(tenantId, id, body, actor);
  }

  @Get("sessions/:id/movements")
  @RequirePermissions("cash_register:movement:read")
  @ApiOperation({
    operationId: "cashRegisterSessionMovements",
    summary: "Oturumun kasa hareketleri",
    description:
      "Oturumun açık olduğu zaman aralığında gerçekleşen tüm " +
      "kasa hareketleri (tahsilat + iade).",
  })
  public async movements(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<CashRegisterMovementListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listMovements(tenantId, id, actor);
  }

  @Get("sessions/:id/summary")
  @RequirePermissions("cash_register:session:read")
  @ApiOperation({
    operationId: "cashRegisterSessionSummary",
    summary: "Oturum özeti ve variance",
    description:
      "Hesap bazlı (cash/card/bank/other) toplam hareketler, " +
      "net bakiye, expected/closing/variance.",
  })
  public async summary(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<CashRegisterSessionSummary> {
    const tenantId = this.requireTenant(actor);
    return this.service.getSummary(tenantId, id, actor);
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
