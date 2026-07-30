/**
 * @file AI modülü.
 * @module apps/api/common/ai/ai.module
 *
 * @description RAG retrieval bileşenlerini DI container'a
 * ekler. FAZ-0 iskeleti: in-memory vector store + basit
 * embedding. Faz 11+ ile gerçek vector DB + OpenAI
 * embedding entegre edilecek.
 *
 * @since GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
 */

import { Global, Module } from "@nestjs/common";

import { RetrievalService } from "./retrieval.service.js";

@Global()
@Module({
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class AiModule {}
