/**
 * @file Timeline service (klinik zaman çizelgesi aggregator).
 * @module apps/api/modules/timeline/timeline.service
 *
 * @description GOAL-024 hayvan zaman çizelgesi iş kuralları. Bir
 * hayvana (patient) ait tüm klinik, petshop, dosya, uyarı ve
 * sahiplik olaylarını `TimelineEventSource` kayıtlarından toplar,
 * sıralar ve tenant izolasyonu ile filtreler.
 *
 * İş kuralları:
 * - `listForPatient(tenantId, patientId, query, actor)`:
 *   - Patient aynı tenant'ta olmalı (cross-tenant → 404
 *     VET-CLINIC-0001). SUPERADMIN tüm tenant'ları görebilir.
 *   - Kayıtlı tüm `TimelineEventSource`'lardan paralel olarak
 *     event toplanır. Bir source hata verirse diğerlerini
 *     ETKİLEMEZ; hatalı source'un olayları boş döner ve
 *     hata log'a düşer (graceful degradation).
 *   - Sonuçlar `occurredAt` desc, sonra `id` desc sırasıyla
 *     sıralanır (en yeni üstte).
 *   - `from`/`to` tarih filtresi service katmanında uygulanır
 *     (event source'lar opsiyonel olarak tarih filtresi alabilir,
 *     ancak service son savunma hattı olarak filtreyi tekrar
 *     uygular).
 *   - `types` filtresi: belirtilmişse yalnızca o tiplerdeki
 *     event'ler döner.
 *   - Pagination: toplam filtre sonrası hesaplanır; ardından
 *     slice edilir.
 * - Audit: timeline okuması audit YAYINLAMAZ (gürültü kontrolü;
 *   hayvan detay sayfası her açıldığında audit üretilmesi log
 *   kirliliği yaratır). İleride tenant başına rate limit / cache
 *   ile birlikte düşünülecek.
 *
 * Event source kayıtları:
 * - `AlertTimelineSource` → `alert` (GOAL-023)
 * - `OwnershipTimelineSource` → `transfer` (GOAL-022)
 * - `FileTimelineSource` → `file` (GOAL-014, patient'a bağlı
 *   dosyalar)
 * - Diğer modüller (appointment, examination, vaccination, …) için
 *   kaynaklar ilgili goal'ler (GOAL-030+) kapsamında eklenecek.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Her source kendi tenant filtresini uygulamalıdır; service
 *   ek savunma olarak hasta varlığını tenant-scoped doğrular.
 *
 * @since GOAL-024 (FAZ-2) hayvan zaman çizelgesi core
 */

import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  PatientsRepository,
  type PatientRecord,
} from "../patients/patients.repository.js";
import {
  TIMELINE_EVENT_SOURCES,
} from "./timeline.sources.js";
import type {
  TimelineEvent,
  TimelineListResult,
  TimelineQuery,
  TimelineEventSource,
} from "../../common/timeline/timeline.types.js";

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  public constructor(
    private readonly patients: PatientsRepository,
    @Inject(TIMELINE_EVENT_SOURCES)
    private readonly sources: ReadonlyArray<TimelineEventSource>,
  ) {}

  /**
   * Bir hayvana ait tüm timeline event'lerini toplar. Hasta
   * aynı tenant'ta olmalı; SUPERADMIN tüm tenant'ları görür.
   */
  public async listForPatient(
    tenantId: string,
    patientId: string,
    query: TimelineQuery,
    actor: ActorContext,
  ): Promise<TimelineListResult> {
    this.requireTenantScope(actor, tenantId);
    this.requirePatient(tenantId, patientId);

    // 1) Tüm source'lardan event'leri paralel olarak topla. Bir
    // source hata verirse diğerlerini etkilemez; hatalı source
    // log'a düşer ve boş döner.
    const settled = await Promise.allSettled(
      this.sources.map((s) =>
        s.fetchForPatient({
          tenantId,
          patientId,
          ...(query.from !== undefined && { from: query.from }),
          ...(query.to !== undefined && { to: query.to }),
          actor,
        }),
      ),
    );

    const events: TimelineEvent[] = [];
    settled.forEach((result, idx) => {
      const source = this.sources[idx];
      if (!source) return;
      if (result.status === "fulfilled") {
        events.push(...result.value);
      } else {
        this.logger.warn(
          `Timeline source ${source.eventType} hata verdi: ${(result.reason as Error)?.message ?? "bilinmeyen"}`,
        );
      }
    });

    // 2) Tip filtresi.
    const typeFilter = query.types && query.types.length > 0
      ? new Set<TimelineEvent["type"]>(query.types)
      : null;
    const filteredByType = typeFilter
      ? events.filter((e) => typeFilter.has(e.type))
      : events;

    // 3) Tarih filtresi (defense-in-depth). Kaynaklar tarih
    // filtresini uygulamış olsa da service son savunma hattı
    // olarak tekrar uygular.
    const filteredByDate = filteredByType.filter((e) => {
      if (query.from && e.occurredAt < query.from) return false;
      if (query.to && e.occurredAt > query.to) return false;
      return true;
    });

    // 4) Sırala: occurredAt desc, sonra id desc (stable).
    filteredByDate.sort((a, b) => {
      if (a.occurredAt !== b.occurredAt) {
        return b.occurredAt.localeCompare(a.occurredAt);
      }
      return b.id.localeCompare(a.id);
    });

    const total = filteredByDate.length;
    const items = filteredByDate.slice(query.offset, query.offset + query.limit);

    return { items, total };
  }

  /** Aktif olarak kayıtlı event source'ların listesi. Test ve
   *  debug amaçlıdır. */
  public listSources(): ReadonlyArray<{
    eventType: TimelineEventSource["eventType"];
    relatedEntityType: TimelineEventSource["relatedEntityType"];
  }> {
    return this.sources.map((s) => ({
      eventType: s.eventType,
      relatedEntityType: s.relatedEntityType,
    }));
  }

  private requirePatient(tenantId: string, patientId: string): PatientRecord {
    const patient = this.patients.findById(tenantId, patientId);
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { patientId },
      });
    }
    return patient;
  }

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }
}
