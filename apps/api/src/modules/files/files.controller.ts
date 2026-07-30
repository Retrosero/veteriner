/**
 * @file Files controller (REST API).
 * @module apps/api/modules/files/files.controller
 *
 * @description Dosya yükleme, indirme, meta ve arşiv endpoint'leri.
 * Multipart upload `POST /api/v1/files` üzerinden alınır; meta ve
 * download `:id` üzerinden sunulur.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/files`                 — Upload (multipart)
 * - `GET    /api/v1/files/:id`             — Meta
 * - `GET    /api/v1/files/:id/download`    — Download (Buffer)
 * - `DELETE /api/v1/files/:id`             — Archive (soft delete)
 *
 * @security Tüm endpoint'ler `ActorInterceptor` üzerinden actor
 *   bilgisi alır. Service katmanı tenant izolasyonu + MIME/boyut/
 *   antivirus kontrollerini uygular. `@RequirePermissions`
 *   dekoratörü ile RBAC kontrolü yapılır.
 *
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import {
  type FileCategory,
  type FileMeta,
  type FileMimeType,
  FILE_LIMITS,
} from "../../common/files/file.types.js";

import { FilesService } from "./files.service.js";

/**
 * Multer File interface'inin backend tarafında kullanılan minimum
 * alanları. `@types/multer` doğrudan bağımlılık olmadığı için inline
 * tanımlanır.
 */
interface UploadedFileLike {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags("files")
@UseGuards(PermissionsGuard)
@Controller("api/v1/files")
export class FilesController {
  public constructor(private readonly service: FilesService) {}

  /**
   * Dosya yükleme. Multipart form-data: `file` (binary), `category`,
   * `relatedEntityType?`, `relatedEntityId?`. Tenant URL path'ten
   * veya header'dan alınır (FAZ-0: header).
   */
  @Post()
  @RequirePermissions("file:file:upload")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({
    operationId: "fileUpload",
    summary: "Dosya yükleme",
    description:
      "Multipart upload. MIME whitelist + boyut + antivirus kontrolleri uygulanır.",
  })
  @ApiResponse({ status: 201, description: "Dosya yüklendi." })
  @ApiResponse({ status: 415, description: "MIME reddedildi veya boyut aşıldı." })
  @ApiResponse({ status: 422, description: "Zararlı içerik tespit edildi." })
  public async upload(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body("category") category: FileCategory,
    @Body("relatedEntityType") relatedEntityType: string | undefined,
    @Body("relatedEntityId") relatedEntityId: string | undefined,
    @CurrentActor() actor: ActorContext,
  ): Promise<FileMeta> {
    if (!file) {
      throw new Error("Multipart 'file' alanı zorunludur");
    }
    const tenantId = this.resolveTenantId(actor);
    const meta = await this.service.upload(
      tenantId,
      {
        category,
        mimeType: this.normalizeMime(file.mimetype),
        originalName: file.originalname,
        sizeBytes: file.size,
        buffer: file.buffer,
        ...(relatedEntityType ? { relatedEntityType } : {}),
        ...(relatedEntityId ? { relatedEntityId } : {}),
      },
      actor,
    );
    return meta;
  }

  /**
   * Dosya meta verisi.
   */
  @Get(":id")
  @RequirePermissions("file:file:read")
  @ApiOperation({ operationId: "fileGetById", summary: "Dosya meta" })
  @ApiResponse({ status: 200, description: "Meta döner." })
  @ApiResponse({ status: 404, description: "Dosya bulunamadı." })
  public async getById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<FileMeta> {
    const meta = this.service.getMeta(id);
    if (!meta) {
      throw new Error("VET-FILE-0003");
    }
    // Tenant izolasyonu: actor'ün tenant'ı meta ile aynı olmalı.
    if (actor.role !== "SUPERADMIN" && meta.tenantId !== actor.tenantId) {
      throw new Error("VET-FILE-0003");
    }
    return meta;
  }

  /**
   * Dosyayı indir. Buffer olarak stream edilir; response header'larında
   * `Content-Type` ve `Content-Disposition` set edilir.
   */
  @Get(":id/download")
  @RequirePermissions("file:file:read")
  @ApiOperation({ operationId: "fileDownload", summary: "Dosya indirme" })
  @ApiResponse({ status: 200, description: "Dosya içeriği." })
  @ApiResponse({ status: 404, description: "Dosya bulunamadı." })
  public async download(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res({ passthrough: false }) res: Response,
    @CurrentActor() actor: ActorContext,
  ): Promise<void> {
    const tenantId = this.resolveTenantId(actor);
    const meta = this.service.getMeta(id);
    if (!meta) {
      res.status(HttpStatus.NOT_FOUND).json({ errorCode: "VET-FILE-0003" });
      return;
    }
    if (actor.role !== "SUPERADMIN" && meta.tenantId !== actor.tenantId) {
      res.status(HttpStatus.NOT_FOUND).json({ errorCode: "VET-FILE-0003" });
      return;
    }
    const data = await this.service.download(tenantId, id, actor);
    res.setHeader("Content-Type", meta.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${this.safeFilename(meta.originalName)}"`,
    );
    res.setHeader("Content-Length", String(data.length));
    res.status(HttpStatus.OK).end(data);
  }

  /**
   * Dosyayı arşivler (soft delete). Storage'da fiziksel silme YAPILMAZ.
   */
  @Delete(":id")
  @RequirePermissions("file:file:delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: "fileArchive", summary: "Dosya arşivleme" })
  @ApiResponse({ status: 204, description: "Arşivlendi." })
  @ApiResponse({ status: 404, description: "Dosya bulunamadı." })
  public async archive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<void> {
    const tenantId = this.resolveTenantId(actor);
    await this.service.archive(tenantId, id, actor);
  }

  private resolveTenantId(actor: ActorContext): string {
    if (actor.tenantId) return actor.tenantId;
    throw new Error("Tenant bağlamı eksik");
  }

  /**
   * MIME tipini whitelist'teki tipe normalize eder. Geçersiz MIME
   * upload aşamasında 415 olarak reddedileceği için burada sadece
   * type cast yapılır.
   */
  private normalizeMime(raw: string): FileMimeType {
    const allowed = FILE_LIMITS.ALLOWED_MIME_TYPES as ReadonlyArray<string>;
    if (allowed.includes(raw)) {
      return raw as FileMimeType;
    }
    throw new Error(`Unsupported MIME type: ${raw}`);
  }

  private safeFilename(name: string): string {
    return name.replace(/[^A-Za-z0-9._-]/g, "_");
  }
}
