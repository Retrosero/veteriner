/**
 * @file AI feature modulu.
 * @module apps/api/modules/ai/ai.module
 * @description AI help endpoint + RAG index endpoint modulu.
 * RetrievalService + AiRagIndexService'i kullanir.
 * FAZ-11: GOAL-115 (context-aware help) + GOAL-116 (RAG index).
 * @since GOAL-005 (FAZ-0) dokumantasyon ve AI bilgi havuzu
 * @updated GOAL-116 (FAZ-11) RAG index endpoint eklendi
 */

import { Module } from "@nestjs/common";

import { AiController } from "./ai.controller.js";
import { AiRagIndexController } from "./ai-rag-index.controller.js";
import { AiRagIndexService } from "./ai-rag-index.service.js";
import { CHUNK_LOADER } from "./ai-rag-index.tokens.js";
import { AiModule as CommonAiModule } from "../../common/ai/ai.module.js";
import { defaultChunkLoader } from "../../common/ai/ai-chunk-loader.service.js";

@Module({
  imports: [CommonAiModule],
  controllers: [AiController, AiRagIndexController],
  providers: [
    {
      provide: CHUNK_LOADER,
      useFactory: () => defaultChunkLoader(),
    },
    AiRagIndexService,
  ],
  exports: [AiRagIndexService],
})
export class AiFeatureModule {}
