/**
 * @file AI modülü.
 * @module apps/api/modules/ai/ai.module
 *
 * @description AI help endpoint modülü. RetrievalService'i
 * kullanır. FAZ-0 iskeleti: retrieval-only, LLM yok.
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 */

import { Module } from "@nestjs/common";

import { AiModule as CommonAiModule } from "../../common/ai/ai.module.js";
import { AiController } from "./ai.controller.js";

@Module({
  imports: [CommonAiModule],
  controllers: [AiController],
})
export class AiFeatureModule {}
