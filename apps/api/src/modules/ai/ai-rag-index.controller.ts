/**
 * @file RAG index controller.
 * @module apps/api/modules/ai/ai-rag-index.controller
 *
 * @description `GET /api/v1/ai/rag/search` — AI_CHUNKS.yaml üzerinde
 * in-memory TF-IDF benzeri arama. SUPERADMIN erişimli (üretim
 * vector DB planı `docs/operations/RAG_CHUNK_PIPELINE.md`'de).
 *
 * GOAL-116 (FAZ-11).
 *
 * @security Tenant filtresi: actor.tenantId null ise sadece
 *   system chunk'ları döner. PII chunk'lar sadece
 *   SUPERADMIN/OWNER/VETERINARIAN rolleri için.
 */

import { Controller, Get, Logger, Query } from "@nestjs/common";
import { z } from "zod";

import {
  AiRagIndexService,
  type RagIndexSearchResponse,
} from "./ai-rag-index.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequireRole } from "../../common/rbac/require-role.decorator.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

/**
 * Query string Zod şeması.
 */
const searchQuerySchema = z.object({
  q: z.string().min(2).max(200),
  locale: z.enum(["tr-TR", "en-GB"]).default("tr-TR"),
  topK: z.coerce.number().int().min(1).max(50).optional(),
});

@Controller("api/v1/ai/rag")
export class AiRagIndexController {
  private readonly logger = new Logger(AiRagIndexController.name);

  public constructor(private readonly ragIndex: AiRagIndexService) {}

  /**
   * `GET /api/v1/ai/rag/search?q=...&locale=tr-TR&topK=10` —
   * AI_CHUNKS.yaml üzerinde arama.
   *
   * @param rawQuery Query string.
   * @param actor Aktör bağlamı.
   */
  @Get("search")
  @RequireRole("SUPERADMIN")
  public async search(
    @Query() rawQuery: unknown,
    @CurrentActor() actor: ActorContext,
  ): Promise<RagIndexSearchResponse> {
    const parsed = searchQuerySchema.parse(rawQuery ?? {});
    this.logger.log({
      msg: "ai.rag.search.request",
      query: parsed.q.slice(0, 100),
      locale: parsed.locale,
      topK: parsed.topK ?? 10,
      actor_id: actor.actorId,
      role: actor.role,
      tenant_id: actor.tenantId,
    });
    return this.ragIndex.search(parsed.q, parsed.locale, actor, parsed.topK);
  }

  /**
   * `GET /api/v1/ai/rag/stats` — indeks sağlık + toplam chunk.
   * SUPERADMIN health-check ve metrikler için.
   */
  @Get("stats")
  @RequireRole("SUPERADMIN")
  public async stats(): Promise<{
    totalChunks: number;
    source: "ai_chunks_yaml" | "empty";
  }> {
    const totalChunks = await this.ragIndex.totalChunks();
    return {
      totalChunks,
      source: totalChunks > 0 ? "ai_chunks_yaml" : "empty",
    };
  }
}
