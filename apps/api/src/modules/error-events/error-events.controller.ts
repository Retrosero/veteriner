/**
 * @file ErrorEvent controller.
 * @module apps/api/modules/error-events/error-events.controller
 *
 * @description GOAL-100 (FAZ-10) Superadmin hata merkezi için
 * read-only REST API. GOAL-101 ile birlikte frontend kaynaklı
 * hata raporlarını kabul eden `POST /api/v1/system/error-events`
 * endpoint'i de bu modülden dışa açılır; ayrı bir controller
 * olarak düzenlenmiştir (tenant context'i farklı).
 *
 * GOAL-103 ile birlikte SUPERADMIN hata merkezine durum yönetimi,
 * atama, transition log ve fingerprint grupları endpointleri
 * eklenmiştir.
 *
 * Endpoint'ler (SUPERADMIN - audit:log:read):
 * - `GET    /api/v1/superadmin/error-events`                   — Filtreli liste
 * - `GET    /api/v1/superadmin/error-events/summary`           — Özet (severity/module)
 * - `GET    /api/v1/superadmin/error-events/groups`            — Fingerprint grupları
 * - `GET    /api/v1/superadmin/error-events/groups/:fp`        — Grup detayı
 * - `GET    /api/v1/superadmin/error-events/fingerprints/:fp`  — Fingerprint detayı
 * - `GET    /api/v1/superadmin/error-events/:id`               — Tek olay detayı
 * - `GET    /api/v1/superadmin/error-events/:id/transitions`   — Status geçişleri
 * - `PATCH  /api/v1/superadmin/error-events/:id/status`        — Status güncelle
 *
 * Endpoint'ler (System - frontend raporu, oturum gerekli):
 * - `POST /api/v1/system/error-events`               — Frontend hata raporu
 *
 * @security SUPERADMIN uçları `audit:log:read` permission'ı
 *   gerektirir; PII mask'lı context response'da yer alır. Stack
 *   trace yalnızca 5xx + critical için dolu. Frontend rapor uçnda
 *   ise auth placeholder'ı yeterlidir; impersonation saldırılarına
 *   karşı tenant/branch/userId/actorType/requestId/country
 *   istemciden alınmaz, aktör bağlamından türetilir.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 *        GOAL-101 (FAZ-10) frontend hata yakalama core
 *        GOAL-103 (FAZ-10) superadmin hata merkezi core
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
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
  clientErrorReportInputSchema,
  errorEventFiltersSchema,
  errorEventGroupFiltersSchema,
  errorEventStatusUpdateInputSchema,
  errorEventSummaryQuerySchema,
  type ClientErrorReportInput,
  type ClientErrorReportResponse,
  type ErrorEvent,
  type ErrorEventFilters,
  type ErrorEventGroup,
  type ErrorEventGroupFilters,
  type ErrorEventGroupListResponse,
  type ErrorEventListResponse,
  type ErrorEventListTransitionsResponse,
  type ErrorEventStatusUpdateInput,
  type ErrorEventStatusUpdateResponse,
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
      "severity/module/errorCode/fingerprint/tenantId/branchId/country/" +
      "release/route/status/assignedToUserId/from/to/search filtreleri; " +
      "sayfalama zorunlu.",
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

  @Get("groups")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventGroupList",
    summary: "Hata grupları listesi (SUPERADMIN)",
    description:
      "Fingerprint bazlı tek satır özet: severity/module/errorCode/" +
      "status/assignedToUserId/eventCount/uniqueTenants/firstSeenAt/" +
      "lastSeenAt. occurrenceCount DESC sıralı. Durum/atama/released " +
      "filtresi buradan uygulanır.",
  })
  public async groups(
    @Query(new ZodValidationPipe(errorEventGroupFiltersSchema))
    query: ErrorEventGroupFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventGroupListResponse> {
    return this.service.listErrorEventGroups(query, actor);
  }

  @Get("groups/:fingerprint")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventGroupDetail",
    summary: "Hata grubu detayı (SUPERADMIN)",
    description:
      "Belirli bir fingerprint için tek satır grup özeti (aynı alanlar).",
  })
  public async groupDetail(
    @Param("fingerprint") fingerprint: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventGroup> {
    return this.service.getErrorEventGroup(fingerprint, actor);
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

  @Get(":id/transitions")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventTransitions",
    summary: "Hata durumu geçişleri (SUPERADMIN)",
    description:
      "Bir hata olayının tüm status geçişlerini append-only log'dan " +
      "tarih sırasıyla döner. Sistem kaynaklı otomatik reopened " +
      "terfileri de dahildir.",
  })
  public async transitions(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventListTransitionsResponse> {
    return this.service.listErrorEventTransitions(id, actor);
  }

  @Patch(":id/status")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventStatusUpdate",
    summary: "Hata durumunu güncelle (SUPERADMIN)",
    description:
      "Hata olayının durumunu state machine'e uygun şekilde günceller. " +
      "Geçerli geçişler: new→{investigating,resolved}; " +
      "investigating→{resolved,new}; resolved→{reopened,investigating}; " +
      "reopened→{investigating,resolved}. Geçersiz geçişlerde 422. " +
      "`assignedToUserId` opsiyonel atama yapar; `clearAssignment=true` " +
      "ile mevcut atama kaldırılır.",
  })
  @ApiResponse({ status: 200, description: "Status güncellendi." })
  @ApiResponse({ status: 404, description: "Hata olayı bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz durum geçişi." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async updateStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(errorEventStatusUpdateInputSchema))
    body: ErrorEventStatusUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventStatusUpdateResponse> {
    return this.service.updateErrorEventStatus(id, body, actor);
  }
}

/**
 * Frontend (tarayıcı) tarafından gönderilen hata raporlarını
 * kabul eden controller. `system` namespace'i altında tutulur
 * çünkü SUPERADMIN paneline değil, oturum açmış tüm kullanıcılara
 * (personel + portal) açıktır.
 *
 * İstemciden gelen tenant/branch/userId/actorType/requestId
 * bilgilerine GÜVENİLMEZ; bunlar aktör bağlamından türetilir.
 * İstemci yalnızca severity, message, stack (opsiyonel), context
 * (PII mask'lı), route, occurredAt (opsiyonel), release (opsiyonel)
 * ve country (opsiyonel) bilgilerini gönderir.
 *
 * Auth placeholder'ı bu endpoint'i kabul eder; gerçek auth
 * devreye girdiğinde JWT/session doğrulaması `ActorContextService`
 * üzerinden otomatik sağlanır.
 *
 * @since GOAL-101 (FAZ-10) frontend hata yakalama core
 */
@ApiTags("system/error-events")
@Controller("api/v1/system/error-events")
export class SystemErrorEventsController {
  public constructor(private readonly service: ErrorEventsService) {}

  @Post()
  @ApiOperation({
    operationId: "clientErrorReport",
    summary: "Frontend hata raporu (oturum gerekli)",
    description:
      "Next.js runtime, API ve kullanıcı arayüzü hatalarını merkezi " +
      "sisteme gönderir. Severity, message, route zorunlu; geri kalan " +
      "opsiyonel. Hassas form verileri gönderilmez; backend context'i " +
      "PiiMasker'dan geçirir.",
  })
  @ApiResponse({ status: 201, description: "Hata kaydı oluşturuldu." })
  @ApiResponse({ status: 400, description: "Geçersiz payload." })
  public report(
    @Body(new ZodValidationPipe(clientErrorReportInputSchema))
    body: ClientErrorReportInput,
    @CurrentActor() actor: ActorContext,
    @Headers("x-request-id") headerRequestId?: string,
  ): ClientErrorReportResponse {
    // X-Request-Id header'ı upstream korelasyon için kullanılır;
    // gelmezse actor.correlationId'e düşer.
    const requestId = headerRequestId ?? actor.correlationId;
    return this.service.recordClientError(body, actor, requestId);
  }
}
