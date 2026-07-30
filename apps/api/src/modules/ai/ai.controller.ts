/**
 * @file AI Help controller.
 * @module apps/api/modules/ai/ai.controller
 *
 * @description Context-aware AI help endpoint'i. Kullanıcının
 * doğal dil sorusunu alır, retrieval yapar, sonuçları döner.
 * LLM çağrısı (cevap üretimi) Faz 11+ ile eklenecek.
 *
 * @security Tenant filtresi zorunlu. PII içeren chunk'lar
 *   yalnızca yetkili rollere açık (FAZ-0'da no-op).
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from "@nestjs/common";

import type {
  RetrieveRequest,
  RetrieveResponse,
} from "../../common/ai/chunk.types.js";
import { RetrievalService } from "../../common/ai/retrieval.service.js";

/**
 * Help request gövdesi. Frontend'den gelen doğal dil
 * sorusu + kullanıcı context'i.
 */
interface HelpRequestBody {
  query: string;
  locale: "tr-TR" | "en-GB";
  currentPage?: string;
  selectedEntity?: string;
  topK?: number;
}

/**
 * Help response gövdesi. Retrieval sonuçları + metadata.
 */
interface HelpResponseBody {
  query_id: string;
  chunks: RetrieveResponse["chunks"];
  duration_ms: number;
  /** LLM tarafından üretilen cevap (Faz 11+'da). */
  answer?: string;
  /** Kaynak chunk'lar (UI'da referans olarak gösterilir). */
  sources: Array<{
    chunk_id: string;
    title: string;
    snippet: string;
  }>;
}

@Controller("api/v1/ai")
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly retrieval: RetrievalService) {}

  /**
   * `POST /api/v1/ai/help` — kullanıcı sorusunu yanıtla.
   *
   * FAZ-0: retrieval sonuçlarını döner, LLM çağrısı yok.
   * Faz 11+: LLM ile cevap üretimi + kaynak gösterimi.
   */
  @Post("help")
  @HttpCode(HttpStatus.OK)
  public async help(
    @Body() body: HelpRequestBody,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // @CurrentUser() user: AuthenticatedUser, // GOAL-011+'da eklenecek
  ): Promise<HelpResponseBody> {
    // Tenant ID, user ID ve role henüz auth context'ten
    // gelmiyor (GOAL-011+'da). FAZ-0 için placeholder.
    const tenantId = "tnt-placeholder";
    const userId = "usr-placeholder";
    const role = "STAFF";

    const request: RetrieveRequest = {
      query: body.query,
      locale: body.locale,
      context: {
        tenantId,
        userId,
        role,
        ...(body.currentPage ? { currentPage: body.currentPage } : {}),
        ...(body.selectedEntity
          ? { selectedEntity: body.selectedEntity }
          : {}),
      },
      topK: body.topK ?? 5,
    };

    const result = await this.retrieval.retrieve(request);

    this.logger.log({
      msg: "ai.help.request",
      query_id: result.query_id,
      query: body.query.slice(0, 100),
      locale: body.locale,
      results: result.chunks.length,
      duration_ms: result.duration_ms,
    });

    return {
      query_id: result.query_id,
      chunks: result.chunks,
      duration_ms: result.duration_ms,
      // answer LLM tarafından Faz 11+'da üretilecek.
      sources: result.chunks.slice(0, 3).map((c) => ({
        chunk_id: c.chunk_id,
        title: c.metadata.title,
        snippet: c.content.slice(0, 200),
      })),
    };
  }
}
