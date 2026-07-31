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
 * GOAL-104 ile birlikte hata atama ve çözüm notları endpointleri
 * eklenmiştir. Notlar, destek bağlantıları, atama ve birleşik
 * audit log endpointleri SUPERADMIN hata merkezinin operasyonel
 * ihtiyaçlarını karşılar; her aksiyon append-only log'a yazılır.
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
 * - `GET    /api/v1/superadmin/error-events/:id/notes`         — Çözüm notları listesi
 * - `POST   /api/v1/superadmin/error-events/:id/notes`         — Çözüm notu ekle
 * - `GET    /api/v1/superadmin/error-events/:id/support-links` — Destek bağlantıları
 * - `POST   /api/v1/superadmin/error-events/:id/support-links` — Destek bağlantısı ekle
 * - `PATCH  /api/v1/superadmin/error-events/:id/assignment`    — Atama/unassign
 * - `GET    /api/v1/superadmin/error-events/:id/assignments`   — Atama geçmişi
 * - `GET    /api/v1/superadmin/error-events/:id/audit-log`     — Birleşik audit log
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
 *        GOAL-104 (FAZ-10) hata atama ve çözüm notları core
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
  errorEventAssignmentInputSchema,
  errorEventFiltersSchema,
  errorEventGroupFiltersSchema,
  errorEventNoteCreateInputSchema,
  errorEventStatusUpdateInputSchema,
  errorEventSummaryQuerySchema,
  errorEventSupportLinkInputSchema,
  type ClientErrorReportInput,
  type ClientErrorReportResponse,
  type ErrorEvent,
  type ErrorEventAssignmentInput,
  type ErrorEventAssignmentListResponse,
  type ErrorEventAssignmentResponse,
  type ErrorEventAuditLogResponse,
  type ErrorEventFilters,
  type ErrorEventGroup,
  type ErrorEventGroupFilters,
  type ErrorEventGroupListResponse,
  type ErrorEventListResponse,
  type ErrorEventListTransitionsResponse,
  type ErrorEventNote,
  type ErrorEventNoteCreateInput,
  type ErrorEventNoteListResponse,
  type ErrorEventStatusUpdateInput,
  type ErrorEventStatusUpdateResponse,
  type ErrorEventSummary,
  type ErrorEventSupportLink,
  type ErrorEventSupportLinkInput,
  type ErrorEventSupportLinkListResponse,
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

  // -------------------------------------------------------------------------
  // Çözüm notu — GOAL-104
  // -------------------------------------------------------------------------

  @Get(":id/notes")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventNoteList",
    summary: "Hata çözüm notları (SUPERADMIN)",
    description:
      "Bir hata olayının tüm çözüm notlarını createdAt artan sırada " +
      "döner. Append-only; silinemez veya düzeltilemez (düzeltme " +
      "yeni not ile yapılır).",
  })
  @ApiResponse({ status: 200, description: "Not listesi." })
  @ApiResponse({ status: 404, description: "Hata olayı bulunamadı." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async listNotes(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventNoteListResponse> {
    return this.service.listErrorEventNotes(id, actor);
  }

  @Post(":id/notes")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventNoteAdd",
    summary: "Hata çözüm notu ekle (SUPERADMIN)",
    description:
      "Hata olayına yeni bir çözüm notu ekler. `authorId`/`authorType` " +
      "aktör bağlamından türetilir. `body` PII mask'lı saklanır.",
  })
  @ApiResponse({ status: 201, description: "Not eklendi." })
  @ApiResponse({ status: 404, description: "Hata olayı bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz not içeriği." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async addNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(errorEventNoteCreateInputSchema))
    body: ErrorEventNoteCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventNote> {
    const note = await this.service.addErrorEventNote(id, body, actor);
    return {
      id: note.id,
      fingerprint: note.fingerprint,
      authorId: note.authorId,
      authorType: note.authorType,
      body: note.body,
      visibility: note.visibility,
      createdAt: note.createdAt,
    };
  }

  // -------------------------------------------------------------------------
  // Destek kaydı bağlantısı — GOAL-104
  // -------------------------------------------------------------------------

  @Get(":id/support-links")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventSupportLinkList",
    summary: "Hata destek bağlantıları (SUPERADMIN)",
    description:
      "Bir hata olayına bağlanan JIRA/Linear/Zendesk/GitHub destek " +
      "kayıtlarını createdAt artan sırada döner.",
  })
  @ApiResponse({ status: 200, description: "Bağlantı listesi." })
  @ApiResponse({ status: 404, description: "Hata olayı bulunamadı." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async listSupportLinks(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventSupportLinkListResponse> {
    return this.service.listErrorEventSupportLinks(id, actor);
  }

  @Post(":id/support-links")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventSupportLinkAdd",
    summary: "Hata destek bağlantısı ekle (SUPERADMIN)",
    description:
      "Hata olayına yeni bir destek kaydı bağlantısı ekler. Sistem, " +
      "externalId, url veya title alanlarından en az biri zorunludur.",
  })
  @ApiResponse({ status: 201, description: "Bağlantı eklendi." })
  @ApiResponse({ status: 404, description: "Hata olayı bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz bağlantı." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async addSupportLink(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(errorEventSupportLinkInputSchema))
    body: ErrorEventSupportLinkInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventSupportLink> {
    const link = await this.service.addErrorEventSupportLink(id, body, actor);
    return {
      id: link.id,
      fingerprint: link.fingerprint,
      system: link.system,
      externalId: link.externalId,
      url: link.url,
      title: link.title,
      createdById: link.createdById,
      createdByType: link.createdByType,
      createdAt: link.createdAt,
    };
  }

  // -------------------------------------------------------------------------
  // Atama — GOAL-104
  // -------------------------------------------------------------------------

  @Patch(":id/assignment")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventAssign",
    summary: "Hata ataması (SUPERADMIN)",
    description:
      "Hata olayını geliştirici/sorumluya atar veya mevcut atamayı " +
      "kaldırır. Status değiştirmez; salt atama aksiyonu izlenir. " +
      "`assigneeId` ile atama; `unassign=true` ile atama kaldırma. " +
      "En az biri zorunludur.",
  })
  @ApiResponse({ status: 200, description: "Atama güncellendi." })
  @ApiResponse({ status: 404, description: "Hata olayı bulunamadı." })
  @ApiResponse({ status: 422, description: "Geçersiz atama." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async assign(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(errorEventAssignmentInputSchema))
    body: ErrorEventAssignmentInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventAssignmentResponse> {
    return this.service.assignErrorEvent(id, body, actor);
  }

  @Get(":id/assignments")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventAssignmentList",
    summary: "Hata atama geçmişi (SUPERADMIN)",
    description:
      "Bir hata olayının tüm atama kayıtlarını assignedAt artan sırada " +
      "döner. Append-only; her atama/unassign yeni kayıt oluşturur.",
  })
  @ApiResponse({ status: 200, description: "Atama geçmişi." })
  @ApiResponse({ status: 404, description: "Hata olayı bulunamadı." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async listAssignments(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventAssignmentListResponse> {
    return this.service.listErrorEventAssignments(id, actor);
  }

  // -------------------------------------------------------------------------
  // Birleşik audit log — GOAL-104
  // -------------------------------------------------------------------------

  @Get(":id/audit-log")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "errorEventAuditLog",
    summary: "Hata birleşik audit log (SUPERADMIN)",
    description:
      "Bir hata olayının tüm aksiyonlarını (status transition + not + " +
      "destek bağlantısı + atama + occurrence_recorded) occurredAt " +
      "artan sırada birleşik timeline olarak döner. UI `action` " +
      "discriminator'ı ile render eder.",
  })
  @ApiResponse({ status: 200, description: "Audit log." })
  @ApiResponse({ status: 404, description: "Hata olayı bulunamadı." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public async auditLog(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ErrorEventAuditLogResponse> {
    return this.service.listErrorEventAuditLog(id, actor);
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
