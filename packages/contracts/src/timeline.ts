/**
 * @file Timeline (klinik zaman çizelgesi) API sözleşmesi.
 * @module @vetniva/contracts/timeline
 *
 * @description GOAL-024 hayvan zaman çizelgesi için API sözleşmesi.
 * Zod şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-024 (FAZ-2) hayvan zaman çizelgesi core
 */

import { z } from "zod";

/** Timeline event tipi. GOAL-024: hayvana ait tüm klinik/petshop/
 *  dosya/ownership olayları tek birleşik timeline'da gösterilir.
 *  `alert`, `transfer` ve `file` aktif kaynaklardan (GOAL-022/023 +
 *  GOAL-014) beslenir; diğer event tipleri için event source
 *  registry FAZ-3+ modülleri hazır olduğunda otomatik olarak
 *  doldurulur. */
export const timelineEventTypeSchema = z.enum([
  /** Klinik randevu. (GOAL-031) */
  "appointment",
  /** Muayene / SOAP kaydı. (GOAL-041) */
  "examination",
  /** Aşı uygulaması. (GOAL-051) */
  "vaccination",
  /** Reçete. (GOAL-045) */
  "prescription",
  /** Ameliyat. (GOAL-080) */
  "surgery",
  /** Yatış / hospitalizasyon. (GOAL-084) */
  "hospitalization",
  /** Laboratuvar sonucu. (GOAL-090) */
  "lab",
  /** Görüntüleme (röntgen, ultrason vb.). (GOAL-093) */
  "imaging",
  /** Petshop satışı. (GOAL-064) */
  "sale",
  /** Yüklenen dosya (medya, rapor vb.). (GOAL-014) */
  "file",
  /** Klinik uyarı (alerji / kronik durum / ilaç etkileşimi). (GOAL-023) */
  "alert",
  /** Sahiplik değişimi (initial + transfer). (GOAL-022) */
  "transfer",
]);
export type TimelineEventType = z.infer<typeof timelineEventTypeSchema>;

/** Timeline'da gösterilebilecek related entity türleri. */
export const timelineRelatedEntityTypeSchema = z.enum([
  "appointment",
  "examination",
  "vaccination",
  "prescription",
  "surgery",
  "hospitalization",
  "lab",
  "imaging",
  "sale",
  "file",
  "alert",
  "ownership",
]);
export type TimelineRelatedEntityType = z.infer<
  typeof timelineRelatedEntityTypeSchema
>;

/** Birleşik timeline event response şeması. */
export const timelineEventSchema = z.object({
  id: z.string(),
  type: timelineEventTypeSchema,
  occurredAt: z.string().datetime(),
  title: z.string(),
  summary: z.string(),
  relatedEntityType: timelineRelatedEntityTypeSchema,
  relatedEntityId: z.string(),
  /** İşlemi yapan kişi/aktör; maskelenmiş olabilir (ör. "Staf
   *  Kullanıcı"). PII içermez; yalnızca görünen ad. */
  actorName: z.string(),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

/** Liste response şeması. */
export const timelineListResponseSchema = z.object({
  items: z.array(timelineEventSchema),
  total: z.number().int().nonnegative(),
});
export type TimelineListResponse = z.infer<typeof timelineListResponseSchema>;

/** Liste sorgu parametreleri. `types` virgülle ayrılmış string
 *  olarak gelir; controller Zod transform ile diziye çevirir
 *  (ZodValidationPipe generic uyumu için transform schema'da
 *  değil controller katmanında uygulanır). */
export const timelineListQuerySchema = z.object({
  /** ISO 8601 datetime. Belirtilirse yalnızca bu tarihten sonraki
   *  olaylar döner (dahil). */
  from: z.string().datetime().optional(),
  /** ISO 8601 datetime. Belirtilirse yalnızca bu tarihten önceki
   *  olaylar döner (dahil). */
  to: z.string().datetime().optional(),
  /** Virgülle ayrılmış tip listesi (raw string). Controller
   *  parse edip enum'a karşı doğrular. */
  types: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type TimelineListQuery = z.infer<typeof timelineListQuerySchema>;
