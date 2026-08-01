/**
 * @file Timeline (klinik zaman çizelgesi) domain tipleri.
 * @module apps/api/common/timeline/timeline.types
 * @description GOAL-024 hayvan zaman çizelgesi domain modeli.
 * Multi-tenant bir ortamda bir hayvana (patient) ait tüm klinik,
 * petshop, dosya, uyarı ve sahiplik olaylarının birleşik bir
 * timeline'da gösterilmesi için sözleşme.
 *
 * Event kaynakları:
 * - `alert` → AlertsService.listForPatient (GOAL-023)
 * - `transfer` → OwnershipHistoryService.search (GOAL-022)
 * - `file` → FilesService (GOAL-014) — `relatedEntityType=patient`
 *   olan dosyalar.
 * - `appointment`, `examination`, `vaccination`, `prescription`,
 *   `surgery`, `hospitalization`, `lab`, `imaging`, `sale` →
 *   ilgili modüller (FAZ-3+) hazır olduğunda otomatik olarak
 *   TimelineService'e event source olarak kayıt edilir.
 *   İlk aşamada bu kaynaklar boş döner; contract sabit kalır.
 * @security Tenant izolasyonu service katmanında uygulanır. Her
 *   event source kendi tenant filtresini uygulamalıdır;
 *   TimelineService yalnızca toplama + sıralama + filtreleme
 *   yapar (kaynak doğrulaması tekrar etmez).
 * @since GOAL-024 (FAZ-2) hayvan zaman çizelgesi core
 */

import type { ActorContext } from "../actor/actor-context.service.js";
import type {
  TimelineEvent,
  TimelineEventType,
  TimelineRelatedEntityType,
} from "@vetniva/contracts";

/**
 * Service katmanında kullanılan timeline event tipi; contract ile
 *  bire bir aynıdır (yeniden export).
 */
export type TimelineEventRecord = TimelineEvent;

/** Contract'tan re-export: servis katmanı tüketicileri için. */
export type { TimelineEvent, TimelineEventType, TimelineRelatedEntityType };

/**
 * Liste sorgu parametreleri. Controller Zod validation sonrası
 *  service'e bu tipte geçirir.
 */
export interface TimelineQuery {
  /** Opsiyonel alt sınır (ISO 8601 datetime). */
  from?: string | undefined;
  /** Opsiyonel üst sınır (ISO 8601 datetime). */
  to?: string | undefined;
  /** Opsiyonel tip filtresi. Boş/undefined = tüm tipler. */
  types?: TimelineEventType[] | undefined;
  /** Maks. Event sayısı. */
  limit: number;
  /** Skip sayısı (sayfa başlangıcı). */
  offset: number;
}

/** Timeline liste response. */
export interface TimelineListResult {
  items: TimelineEvent[];
  /** Filtre sonrası toplam kayıt sayısı (limit/offset öncesi). */
  total: number;
}

/**
 * Timeline event source arayüzü. Her modül (alerts, ownership,
 *  files, vb.) kendi event source'unu DI üzerinden TimelineService'e
 *  sağlar. `eventType` alanı sabit olup o source'un hangi tipte
 *  event ürettiğini belirtir; aynı source birden fazla tip üretemez.
 */
export interface TimelineEventSource {
  /** Bu source'un ürettiği event tipi (ör. "alert"). */
  readonly eventType: TimelineEventType;
  /** Related entity türü (ör. "alert", "ownership", "file"). */
  readonly relatedEntityType: TimelineRelatedEntityType;
  /**
   * Tenant + hasta için bu source'un event'lerini getirir. Tenant
   * izolasyonu source'un kendi sorumluluğundadır; burada yeniden
   * tenant filtresi uygulanmaz. `from`/`to` opsiyonel tarih
   * filtresidir; tip filtresi service katmanında uygulanır.
   */
  fetchForPatient(args: {
    tenantId: string;
    patientId: string;
    from?: string;
    to?: string;
    actor: ActorContext;
  }): Promise<TimelineEvent[]>;
}
