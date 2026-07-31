/**
 * @file SecurityEvent controller.
 * @module apps/api/modules/security-events/security-events.controller
 *
 * @description GOAL-105 (FAZ-10) güvenlik logları ve alarm
 * kuralları için SUPERADMIN REST API. Frontend raporları için
 * ayrı bir `SystemSecurityEventsController` da aynı modülden
 * dışa açılır; auth placeholder tüm oturum açmış kullanıcılara
 * izin verir.
 *
 * Endpoint'ler (SUPERADMIN - audit:log:read):
 * - `GET /api/v1/superadmin/security-events`            — Filtreli liste
 * - `GET /api/v1/superadmin/security-events/summary`    — Özet (severity/type + topGroups)
 * - `GET /api/v1/superadmin/security-events/:id`        — Tek olay detayı
 *
 * Endpoint'ler (System - frontend raporu, oturum gerekli):
 * - `POST /api/v1/system/security-events`               — Frontend güvenlik raporu
 *
 * @security SUPERADMIN uçları `audit:log:read` permission'ı
 *   gerektirir. Frontend rapor uçnda ise auth placeholder'ı
 *   yeterlidir; tenant/branch/userId/actorType/requestId/country
 *   istemciden alınmaz, aktör bağlamından türetilir.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  clientSecurityEventInputSchema,
  securityEventFiltersSchema,
  securityEventSummaryQuerySchema,
  type ClientSecurityEventInput,
  type ClientSecurityEventResponse,
  type SecurityEvent,
  type SecurityEventFilters,
  type SecurityEventListResponse,
  type SecurityEventSummary,
  type SecurityEventSummaryQuery,
} from "@vetniva/contracts";

import { SecurityEventsService } from "./security-events.service.js";

@ApiTags("superadmin/security-events")
@UseGuards(PermissionsGuard)
@Controller("api/v1/superadmin/security-events")
export class SecurityEventsController {
  public constructor(private readonly service: SecurityEventsService) {}

  @Get()
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "securityEventList",
    summary: "Güvenlik olayı arama (SUPERADMIN)",
    description:
      "Tüm tenant'ların güvenlik olaylarını filtreli olarak listeler. " +
      "type/severity/module/fingerprint/tenantId/branchId/userId/country/" +
      "release/route/from/to/search filtreleri; sayfalama zorunlu.",
  })
  @ApiResponse({ status: 200, description: "Liste döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async list(
    @Query(new ZodValidationPipe(securityEventFiltersSchema))
    query: SecurityEventFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<SecurityEventListResponse> {
    return this.service.listSecurityEvents(query, actor);
  }

  @Get("summary")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "securityEventSummary",
    summary: "Güvenlik olayı özeti (SUPERADMIN)",
    description:
      "Severity × type kırılımı ve toplam sayılar. Tüm fingerprint'lerin " +
      "eventCount'una göre azalan sıralı top-20'si (saldırı sınıfı kartları).",
  })
  public async summary(
    @Query(new ZodValidationPipe(securityEventSummaryQuerySchema))
    query: SecurityEventSummaryQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<SecurityEventSummary> {
    return this.service.getSecurityEventSummary(query, actor);
  }

  @Get(":id")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "securityEventDetail",
    summary: "Güvenlik olayı detayı (SUPERADMIN)",
    description:
      "Tek güvenlik olayı detayı (mask'li IP, PII mask'lı context).",
  })
  public async detail(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<SecurityEvent> {
    return this.service.getSecurityEventDetail(id, actor);
  }
}

/**
 * Frontend tarafından gönderilen güvenlik raporlarını kabul eden
 * controller. `system` namespace'i altında tutulur çünkü
 * SUPERADMIN paneline değil, oturum açmış tüm kullanıcılara açıktır.
 *
 * İstemciden gelen tenant/branch/userId/actorType/requestId
 * bilgilerine GÜVENİLMEZ; bunlar aktör bağlamından türetilir.
 * İstemci yalnızca type, message, severity (opsiyonel), errorCode
 * (opsiyonel), statusCode (opsiyonel), context (PII mask'lı), route
 * zorunlu; occurredAt (opsiyonel), release (opsiyonel), country
 * (opsiyonel) bilgilerini gönderir.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */
@ApiTags("system/security-events")
@Controller("api/v1/system/security-events")
export class SystemSecurityEventsController {
  public constructor(private readonly service: SecurityEventsService) {}

  @Post()
  @ApiOperation({
    operationId: "clientSecurityEventReport",
    summary: "Frontend güvenlik raporu (oturum gerekli)",
    description:
      "Next.js runtime veya kullanıcı arayüzü tarafından tespit edilen " +
      "güvenlik olaylarını merkezi sisteme gönderir. type, message, route " +
      "zorunlu. Hassas form verileri gönderilmez; backend context'i " +
      "PiiMasker'dan geçirir. Critical olayda alarm adapter tetiklenir.",
  })
  @ApiResponse({ status: 201, description: "Güvenlik kaydı oluşturuldu." })
  @ApiResponse({ status: 400, description: "Geçersiz payload." })
  public report(
    @Body(new ZodValidationPipe(clientSecurityEventInputSchema))
    body: ClientSecurityEventInput,
    @CurrentActor() actor: ActorContext,
    @Headers("x-request-id") headerRequestId?: string,
  ): ClientSecurityEventResponse {
    // X-Request-Id header'ı upstream korelasyon için kullanılır;
    // gelmezse actor.correlationId'e düşer.
    const correlationId = headerRequestId ?? actor.correlationId;
    const actorWithReqId: ActorContext = {
      ...actor,
      correlationId,
    };
    return this.service.recordClientSecurityEvent(body, actorWithReqId);
  }
}
