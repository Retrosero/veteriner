/**
 * @file File controller.
 * @module apps/api/modules/file/file.controller
 *
 * @description Dosya servisi REST API. Multipart upload yerine JSON +
 * base64 body kullanır (pilot için yeterli; büyük dosyalar için
 * presigned URL pattern'i GOAL-014+ sonrası). Signed URL'ler
 * service üzerinden üretilir.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/files`                — Upload (JSON base64 + meta)
 * - `GET    /api/v1/files`                — Liste (filtre + sayfa)
 * - `GET    /api/v1/files/:id`            — Detay
 * - `POST   /api/v1/files/:id/signed-url` — Signed URL üret
 * - `POST   /api/v1/files/:id/archive`    — Arşivle (soft delete)
 *
 * @security
 * - Tüm endpoint'ler `PermissionsGuard` + `RequirePermissions`
 *   dekoratörü ile korunur.
 * - Cross-tenant denemesi → 404 (service katmanı).
 * - Upload tenant context zorunlu.
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
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
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import {
  fileArchiveRequestSchema,
  fileListQuerySchema,
  signedUrlRequestSchema,
  uploadRequestSchema,
  type FileArchiveRequest,
  type FileListQuery,
  type FileListResponse,
  type FileMeta,
  type SignedUrlRequest,
  type SignedUrlResponse,
} from "@vetniva/contracts";
import { z } from "zod";

import { FileService } from "./file.service.js";

/**
 * Upload body: `data` base64-encoded içerik + metadata.
 * Maks. 25 MB soft limit service'te kontrol edilir.
 */
const uploadBodySchema = z.object({
  data: z.string().min(1), // base64
  meta: uploadRequestSchema,
});
type UploadBody = z.infer<typeof uploadBodySchema>;

@ApiTags("files")
@UseGuards(PermissionsGuard)
@Controller("api/v1/files")
export class FileController {
  public constructor(private readonly service: FileService) {}

  /**
   * Dosya yükleme. JSON body: `{ data: <base64>, meta: { ... } }`.
   * Multipart desteği GOAL-014+ sonrası eklenecek.
   */
  @Post()
  @RequirePermissions("file:file:upload")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "fileUpload",
    summary: "Dosya yükleme",
    description:
      "JSON + base64 body ile dosya yükler. MIME whitelist: image/jpeg, image/png, application/pdf, application/dicom. Soft limit 25 MB.",
  })
  @ApiResponse({ status: 201, description: "Dosya yüklendi." })
  @ApiResponse({ status: 400, description: "Geçersiz MIME veya boyut." })
  public async upload(
    @Body(new ZodValidationPipe(uploadBodySchema))
    body: UploadBody,
    @CurrentActor() actor: ActorContext,
  ): Promise<FileMeta> {
    const buffer = Buffer.from(body.data, "base64");
    return this.service.upload(
      {
        meta: {
          ...body.meta,
          sizeBytes: buffer.byteLength,
        },
        body: buffer,
      },
      actor,
    );
  }

  /**
   * Sayfalı dosya listesi. Filtre: mime, relatedEntity, visibility,
   * includeArchived.
   */
  @Get()
  @RequirePermissions("file:file:read")
  @ApiOperation({
    operationId: "fileList",
    summary: "Dosya listesi",
    description:
      "Tenant-scoped sayfalı dosya listesi. Arşivlenmişler default dışlanır.",
  })
  @ApiResponse({ status: 200, description: "Liste döner." })
  public async list(
    @Query(new ZodValidationPipe(fileListQuerySchema))
    query: FileListQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<FileListResponse> {
    return this.service.list(query, actor);
  }

  /**
   * Dosya detayı. Cross-tenant → 404; karantina/arsiv → 404.
   */
  @Get(":id")
  @RequirePermissions("file:file:read")
  @ApiOperation({
    operationId: "fileGetById",
    summary: "Dosya detayı",
  })
  @ApiResponse({ status: 200, description: "Dosya döner." })
  @ApiResponse({ status: 404, description: "Dosya bulunamadı/karantinada/arsiv." })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<FileMeta> {
    return this.service.findById(id, actor);
  }

  /**
   * Kısa ömürlü signed URL üretir (5-60 dk).
   */
  @Post(":id/signed-url")
  @RequirePermissions("file:file:read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "fileSignedUrl",
    summary: "Signed URL üretimi",
    description:
      "Storage backend üzerinden kısa ömürlü (60-3600 sn) imzalı URL üretir. Infected veya pending dosyalar için reddedilir.",
  })
  @ApiResponse({ status: 200, description: "URL döner." })
  @ApiResponse({ status: 409, description: "Dosya henüz indirilebilir değil." })
  public async signedUrl(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(signedUrlRequestSchema))
    body: SignedUrlRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<SignedUrlResponse> {
    return this.service.getSignedUrl(id, { expiresInSec: body.expiresInSec }, actor);
  }

  /**
   * Dosyayı arşivler (soft delete). `reason` zorunlu.
   */
  @Post(":id/archive")
  @RequirePermissions("file:file:delete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "fileArchive",
    summary: "Dosya arşivleme",
    description:
      "Dosyayı soft-delete yapar. Storage'da arşiv klasörüne taşınır; DB'de archivedAt set edilir. Fiziksel silme YOK.",
  })
  @ApiResponse({ status: 200, description: "Dosya arşivlendi." })
  public async archive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(fileArchiveRequestSchema))
    body: FileArchiveRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<FileMeta> {
    return this.service.archive(id, body, actor);
  }
}
