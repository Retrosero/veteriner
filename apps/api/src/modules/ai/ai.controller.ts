/**
 * @file AI Help controller.
 * @module apps/api/modules/ai/ai.controller
 * @description Context-aware AI help endpoint'i (GOAL-115).
 * Kullanıcının doğal dil sorusunu alır, retrieval yapar,
 * context-aware cevap üretir. LLM çağrısı Faz 12+ ile
 * eklenecek; Faz 11'de template-based answer üretimi.
 * @security Tenant filtresi zorunlu. PII içeren chunk'lar
 *   yalnızca yetkili rollere açık. Cross-tenant retrieval
 *   kapatıldı.
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 * @updated GOAL-115 (FAZ-11) context-aware help endpoint
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RetrievalService } from "../../common/ai/retrieval.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  RetrieveRequest,
  RetrieveResponse,
} from "../../common/ai/chunk.types.js";

/** Help request Zod şeması (input validation). */
const helpRequestSchema = z.object({
  query: z.string().min(3).max(500),
  locale: z.enum(["tr-TR", "en-GB"]),
  currentPage: z.string().max(256).optional(),
  selectedEntity: z.string().max(256).optional(),
  topK: z.number().int().min(1).max(20).optional(),
  /**
   * Üretim kaynağı. Belirtilmezse davranış chunks.length'e göre
   * otomatik seçilir: `template` (boş) | `retrieval` (var, kısa) |
   * `hybrid` (var, uzun). `retrieval` zorlanırsa AI_CHUNKS.yaml'dan
   * retrieval sonuçları önceliklendirilir.
   */
  generationSource: z
    .enum(["auto", "template", "retrieval", "hybrid"])
    .optional(),
});

/** Help response gövdesi. */
interface HelpResponseBody {
  query_id: string;
  chunks: RetrieveResponse["chunks"];
  duration_ms: number;
  /** Context-aware üretilen cevap. */
  answer: string;
  /** Kaynak chunk'lar (UI'da referans olarak gösterilir). */
  sources: Array<{
    chunk_id: string;
    title: string;
    snippet: string;
  }>;
  /** Üretim kaynağı (template | retrieval | hybrid). */
  generationSource: "template" | "retrieval" | "hybrid";
}

@Controller("api/v1/ai")
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly retrieval: RetrievalService) {}

  /**
   * `POST /api/v1/ai/help` — kullanıcı sorusunu context-aware
   * yanıtla (GOAL-115). Retrieval + template-based answer
   * üretimi yapar; LLM entegrasyonu Faz 12+ ile eklenecek.
   * @param rawBody
   * @param actor
   */
  @Post("help")
  @HttpCode(HttpStatus.OK)
  public async help(
    @Body() rawBody: unknown,
    @CurrentActor() actor: ActorContext,
  ): Promise<HelpResponseBody> {
    // Input validation (Zod).
    const body = helpRequestSchema.parse(rawBody);

    // Tenant filtresi: actor.tenantId null ise (system /
    // pre-auth) cross-tenant retrieval kapatılır.
    const tenantId = actor.tenantId ?? "system";
    const userId = actor.actorId ?? "anonymous";
    const role = actor.role ?? "STAFF";

    const request: RetrieveRequest = {
      query: body.query,
      locale: body.locale,
      context: {
        tenantId,
        userId,
        role,
        ...(body.currentPage ? { currentPage: body.currentPage } : {}),
        ...(body.selectedEntity ? { selectedEntity: body.selectedEntity } : {}),
      },
      topK: body.topK ?? 5,
    };

    const result = await this.retrieval.retrieve(request);

    // Template-based answer üretimi (Faz 11+). LLM entegrasyonu
    // Faz 12+ ile bu kısım değiştirilecek.
    const answer = this.composeAnswer({
      query: body.query,
      chunks: result.chunks,
      locale: body.locale,
      role,
      currentPage: body.currentPage,
    });

    this.logger.log({
      msg: "ai.help.request",
      query_id: result.query_id,
      query: body.query.slice(0, 100),
      locale: body.locale,
      tenant_id: tenantId,
      role,
      results: result.chunks.length,
      duration_ms: result.duration_ms,
    });

    return {
      query_id: result.query_id,
      chunks: result.chunks,
      duration_ms: result.duration_ms,
      answer,
      sources: result.chunks.slice(0, 3).map((c) => ({
        chunk_id: c.chunk_id,
        title: c.metadata.title,
        snippet: c.content.slice(0, 200),
      })),
      generationSource: this.resolveGenerationSource(
        body.generationSource,
        result.chunks.length,
        answer.length,
      ),
    };
  }

  /**
   * Generation source seçimi. Client `auto` (default) belirtirse
   * chunks uzunluğu + answer uzunluğuna göre otomatik seçilir;
   * belirli bir mod zorlanırsa o kullanılır (chunks boş olsa bile
   * `retrieval` seçilebilir — bu durumda boş sources döner).
   * @param requested
   * @param chunksCount
   * @param answerLength
   */
  private resolveGenerationSource(
    requested: "auto" | "template" | "retrieval" | "hybrid" | undefined,
    chunksCount: number,
    answerLength: number,
  ): HelpResponseBody["generationSource"] {
    if (requested && requested !== "auto") {
      return requested;
    }
    if (chunksCount === 0) return "template";
    return answerLength > 50 ? "hybrid" : "retrieval";
  }

  /**
   * Basit template-based answer üretimi. Retrieval sonuçlarından
   * en yüksek skorlu chunk'ın title + content özetini döner.
   * LLM entegrasyonu Faz 12+'da bu fonksiyonun yerini alır.
   * @param args
   * @param args.query
   * @param args.chunks
   * @param args.locale
   * @param args.role
   * @param args.currentPage
   */
  private composeAnswer(args: {
    query: string;
    chunks: RetrieveResponse["chunks"];
    locale: "tr-TR" | "en-GB";
    role: string;
    currentPage?: string | undefined;
  }): string {
    if (args.chunks.length === 0) {
      return args.locale === "tr-TR"
        ? "Bu konu için uygun bir kaynak bulunamadı. Lütfen daha spesifik bir soru sorun veya klinik personeline danışın."
        : "No relevant resource found for this topic. Please ask a more specific question or consult clinic staff.";
    }

    const top = args.chunks[0]!;
    const isTr = args.locale === "tr-TR";

    if (args.currentPage) {
      return isTr
        ? `"${args.currentPage}" sayfasındaki sorunuza ilişkin en uygun kaynak: **${top.metadata.title}**.\n\n${top.content.slice(0, 300)}…\n\nDaha fazla bilgi için kaynak chunk'ları inceleyin veya klinik personeline danışın.`
        : `For your question on "${args.currentPage}", the most relevant resource is: **${top.metadata.title}**.\n\n${top.content.slice(0, 300)}…\n\nFor more details, review the source chunks or consult clinic staff.`;
    }

    return isTr
      ? `Sorunuza en uygun kaynak: **${top.metadata.title}**.\n\n${top.content.slice(0, 300)}…`
      : `Most relevant resource: **${top.metadata.title}**.\n\n${top.content.slice(0, 300)}…`;
  }
}
