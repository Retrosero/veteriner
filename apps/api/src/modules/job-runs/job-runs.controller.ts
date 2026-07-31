/**
 * @file JobRun controller.
 * @module apps/api/modules/job-runs/job-runs.controller
 *
 * @description GOAL-102 (FAZ-10) background job ve entegrasyon
 * logları için SUPERADMIN REST API.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/superadmin/job-runs`                — Yeni run başlat
 * - `POST   /api/v1/superadmin/job-runs/:id/finish`     — Run'ı sonuçlandır
 * - `POST   /api/v1/superadmin/job-runs/:id/retry`      — Manuel retry
 * - `GET    /api/v1/superadmin/job-runs`                — Filtreli liste
 * - `GET    /api/v1/superadmin/job-runs/summary`        — Aggregate özet
 * - `GET    /api/v1/superadmin/job-runs/dead-letter`    — Dead-letter view
 * - `GET    /api/v1/superadmin/job-runs/attempts/:jobKey` — Aynı işin tüm denemeleri
 * - `GET    /api/v1/superadmin/job-runs/:id`            — Tek run detayı
 *
 * Tüm endpoint'ler `audit:log:read` permission'ı gerektirir
 * (SUPERADMIN). Tenant filtresi opsiyoneldir; tenant context'i
 * actor'dan alınır (request body'ye güvenilmez).
 *
 * @security SUPERADMIN uçları `audit:log:read` permission'ı
 *   gerektirir. PII mask'lı input/output response'da yer alır.
 *   `errorStack` yalnızca failed/dead_letter için dolu.
 *
 * @since GOAL-102 (FAZ-10) background job ve entegrasyon logları core
 */

import {
  Body,
  Controller,
  Get,
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
  deadLetterQuerySchema,
  jobRunFiltersSchema,
  jobRunFinishInputSchema,
  jobRunRetryInputSchema,
  jobRunStartInputSchema,
  jobRunSummaryQuerySchema,
  type DeadLetterQuery,
  type JobRun,
  type JobRunAttemptsByKeyResponse,
  type JobRunFinishInput,
  type JobRunListResponse,
  type JobRunRetryInput,
  type JobRunStartInput,
  type JobRunSummary,
  type JobRunSummaryQuery,
  type JobRunFilters,
} from "@vetniva/contracts";

import { JobRunsService } from "./job-runs.service.js";

@ApiTags("superadmin/job-runs")
@UseGuards(PermissionsGuard)
@Controller("api/v1/superadmin/job-runs")
export class JobRunsController {
  public constructor(private readonly service: JobRunsService) {}

  @Post()
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "jobRunStart",
    summary: "Yeni job run başlat (SUPERADMIN)",
    description:
      "Bir background job veya entegrasyon çağrısı için yeni bir " +
      "deneme kaydı açar. `queueName`/`jobName`/`jobKey` zorunlu. " +
      "Default `attempt=1` ve `status='running'` ile başlar.",
  })
  @ApiResponse({ status: 201, description: "Run kaydı oluşturuldu." })
  @ApiResponse({ status: 400, description: "Geçersiz payload." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public start(
    @Body(new ZodValidationPipe(jobRunStartInputSchema))
    body: JobRunStartInput,
  ): JobRun {
    return this.service.startRun(body);
  }

  @Post(":id/finish")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "jobRunFinish",
    summary: "Job run'ı sonuçlandır (SUPERADMIN)",
    description:
      "Çalışan run'ı `succeeded`/`failed`/`dead_letter` olarak " +
      "kapatır. `succeeded` için `output`, `failed`/`dead_letter` " +
      "için `errorCode` zorunlu. `attempt >= maxAttempts` olan " +
      "failed otomatik dead_letter'a terfi eder.",
  })
  @ApiResponse({ status: 200, description: "Run güncellendi." })
  @ApiResponse({ status: 404, description: "Run bulunamadı." })
  @ApiResponse({ status: 409, description: "Run zaten terminal." })
  public finish(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(jobRunFinishInputSchema))
    body: JobRunFinishInput,
  ): JobRun {
    return this.service.finishRun(id, body);
  }

  @Post(":id/retry")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "jobRunRetry",
    summary: "Job run için manuel retry (SUPERADMIN)",
    description:
      "Yalnızca `failed` veya `dead_letter` durumdaki run'lardan " +
      "yeni deneme başlatır. Yeni run `parentRunId` ile eski run'a " +
      "bağlanır; `attempt` bir artırılır.",
  })
  @ApiResponse({ status: 201, description: "Yeni run oluşturuldu." })
  @ApiResponse({ status: 404, description: "Run bulunamadı." })
  @ApiResponse({ status: 409, description: "Run retry için uygun değil." })
  public retry(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
    @Body(new ZodValidationPipe(jobRunRetryInputSchema))
    body: JobRunRetryInput = {},
  ): JobRun {
    return this.service.retryRun(id, actor, body);
  }

  @Get()
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "jobRunList",
    summary: "Job run arama (SUPERADMIN)",
    description:
      "Tüm tenant'ların job run'larını filtreli listeler. " +
      "queueName/jobName/jobKey/status/source/tenantId/branchId/" +
      "country/triggeredBy/from/to/search/sort/limit/offset.",
  })
  @ApiResponse({ status: 200, description: "Liste döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public list(
    @Query(new ZodValidationPipe(jobRunFiltersSchema))
    query: JobRunFilters,
    @CurrentActor() actor: ActorContext,
  ): JobRunListResponse {
    return this.service.listJobRuns(query, actor);
  }

  @Get("summary")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "jobRunSummary",
    summary: "Job run özeti (SUPERADMIN)",
    description:
      "Status × queue aggregate. Toplam run sayısı, status kırılımı, " +
      "queue kırılımı (succeeded/failed/dead_letter/running/pending), " +
      "son 24 saatteki dead-letter sayısı, en eski running/pending.",
  })
  @ApiResponse({ status: 200, description: "Özet döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public summary(
    @Query(new ZodValidationPipe(jobRunSummaryQuerySchema))
    query: JobRunSummaryQuery,
    @CurrentActor() actor: ActorContext,
  ): JobRunSummary {
    return this.service.getJobRunSummary(query, actor);
  }

  @Get("dead-letter")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "jobRunDeadLetter",
    summary: "Dead-letter view (SUPERADMIN)",
    description:
      "Yalnızca `status = dead_letter` olan run'ları listeler. " +
      "tenant/queue/jobName/from/to filtreleri + sayfalama.",
  })
  @ApiResponse({ status: 200, description: "Dead-letter listesi döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public deadLetter(
    @Query(new ZodValidationPipe(deadLetterQuerySchema))
    query: DeadLetterQuery,
    @CurrentActor() actor: ActorContext,
  ): JobRunListResponse {
    return this.service.listDeadLetter(query, actor);
  }

  @Get("attempts/:jobKey")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "jobRunAttemptsByKey",
    summary: "Aynı jobKey'in tüm denemeleri (SUPERADMIN)",
    description:
      "Belirli bir `jobKey` için tüm retry geçmişini (en eski " +
      "önce) döner. `allFailed` ve `lastStatus` özet alanları " +
      "operatör kararını kolaylaştırır.",
  })
  @ApiResponse({ status: 200, description: "Deneme listesi döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  public attemptsByKey(
    @Param("jobKey") jobKey: string,
    @CurrentActor() actor: ActorContext,
  ): JobRunAttemptsByKeyResponse {
    return this.service.listAttemptsByJobKey(jobKey, actor);
  }

  @Get(":id")
  @RequirePermissions("audit:log:read")
  @ApiOperation({
    operationId: "jobRunDetail",
    summary: "Job run detayı (SUPERADMIN)",
    description:
      "Tek run kaydı detayı. `input` ve `output` PII mask'lı; " +
      "`errorStack` yalnızca failed/dead_letter için dolu.",
  })
  @ApiResponse({ status: 200, description: "Run detayı döner." })
  @ApiResponse({ status: 403, description: "Yetkisiz erişim." })
  @ApiResponse({ status: 404, description: "Run bulunamadı." })
  public detail(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): JobRun {
    return this.service.getJobRunDetail(id, actor);
  }
}
