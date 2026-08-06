/**
 * @file KVKK erasure request DTO index.
 * @module apps/api/modules/kvkk/dto
 *
 * @description Sözleşme katmanı (`packages/contracts/src/kvkk.ts`)
 *   zaten Zod şemalarını içerir. Burada yalnızca lokal olarak
 *   pipe'lenmiş tip alias'ları dışa aktarıyoruz; controller
 *   katmanı `ZodValidationPipe` ile doğrudan sözleşmeyi kullanır.
 *
 * @since GOAL-126 (FAZ-12) KVKK controller + endpoint'ler
 */

export {
  kvkkErasureRequestInputSchema,
  kvkkErasureRequestListQuerySchema,
  type KvkkErasureRequestInput,
  type KvkkErasureRequestListQuery,
} from "@vetniva/contracts";
