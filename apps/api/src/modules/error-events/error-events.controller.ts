/**
 * @file ErrorEvent controller.
 * @module apps/api/modules/error-events/error-events.controller
 *
 * @description GOAL-100 (FAZ-10) Superadmin hata merkezi için
 * read-only REST API.
 *
 * Endpoint'ler:
 * - `GET /api/v1/superadmin/error-events`             — Filtreli liste
 * - `GET /api/v1/superadmin/error-events/summary`     — Özet (severity/module)
 * - `GET /api/v1/superadmin/error-events/fingerprints/:fingerprint` — Fingerprint detayı
 * - `GET /api/v1/superadmin/error-events/:id`         — Tek olay detayı
 *
 * @security Yalnızca SUPERADMIN (`audit:log:read` permission).
 *   PII mask'lı context response'da yer alır. Stack trace
 *   yalnızca 5xx + critical için dolu.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 */

import {
  Controller,
  Get,
  Param,
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
  errorEventFiltersSchema,
  errorEventSummaryQuerySchema,
  type ErrorEvent,
  type ErrorEventFilters,
  type ErrorEventListResponse,
  type ErrorEventSummary,
} from "@vetniva/contracts";

import { ErrorEventsService } from "./error-events.service.js";

@ApiTags("superadmin/error-events")
@UseGuards(PermissionsGuard)
@Controller("api/v1/superadmin/error-events")
export class ErrorEventsController {
  public constructor(private readonly service: ErrorEventsService) {}

  @Get()
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventList",
    summary: "Hata olayı arama (SUPERADMIN)",
    description:
      "Tüm tenant'ların hata olaylarını filtreli olarak listeler. " +
      "severity/module/errorCode/fingerprint/tenantId/country/route/" +
      "from/to/search filtreleri; sayfalama zorunlu.",
  })
  @ApiResponse({ status: 200, description: "Liste döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async list(
    @Query(new ZodValidationPipe(errorEventFiltersSchema))
    query: ErrorEventFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventListResponse> {
    return this.service.listErrorEvents(query, actor);
  }

  @Get("summary")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventSummary",
    summary: "Hata olayı özeti (SUPERADMIN)",
    description:
      "Severity × module × errorCode bucket'ları ve toplam sayılar. " +
      "Tüm fingerprint'lerin eventCount'una göre azalan sıralı top-20'si.",
  })
  public async summary(
    @Query(new ZodValidationPipe(errorEventSummaryQuerySchema))
    query: ReturnType<typeof errorEventSummaryQuerySchema.parse>,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventSummary> {
    return this.service.getErrorEventSummary(query, actor);
  }

  @Get("fingerprints/:fingerprint")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventByFingerprint",
    summary: "Fingerprint detayı (SUPERADMIN)",
    description:
      "Belirli bir fingerprint için toplu kayıt (occurrenceCount + " +
      "lastSeen + ilk kayıt).",
  })
  public async byFingerprint(
    @Param("fingerprint") fingerprint: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEvent> {
    return this.service.listOccurrencesByFingerprint(fingerprint, actor);
  }

  @Get(":id")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventDetail",
    summary: "Hata olayı detayı (SUPERADMIN)",
    description:
      "Tek hata olayı detayı (stack trace 5xx + critical için dolu).",
  })
  public async detail(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEvent> {
    return this.service.getErrorEventDetail(id, actor);
  }
}
