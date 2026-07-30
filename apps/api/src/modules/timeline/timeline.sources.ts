/**
 * @file Timeline event source registry + concrete source'lar.
 * @module apps/api/modules/timeline/timeline.sources
 *
 * @description GOAL-024 timeline için event source DI token'ı ve
 * FAZ-2'de aktif olan üç somut source: `AlertTimelineSource`,
 * `OwnershipTimelineSource`, `FileTimelineSource`. Diğer modüller
 * (appointment, examination, …) ilgili goal'ler kapsamında
 * kendi source'larını ekleyecek.
 *
 * Her source `TimelineEventSource` arayüzünü uygular ve tek bir
 * `eventType` üretir. Tenant izolasyonu source'un kendi
 * repository/service'i tarafından sağlanır.
 *
 * @since GOAL-024 (FAZ-2) hayvan zaman çizelgesi core
 */

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AlertRecord } from "../../common/alerts/alert.types.js";
import type {
  TimelineEvent,
  TimelineEventSource,
} from "../../common/timeline/timeline.types.js";
import { AlertsService } from "../alerts/alerts.service.js";
import { OwnershipHistoryRepository } from "../ownership-history/ownership-history.repository.js";
import { FilesService } from "../files/files.service.js";
import type { FileMeta } from "../../common/files/file.types.js";
import type { Ownership } from "../../common/ownership/ownership.types.js";

/** DI token: TimelineService'in kullandığı source listesi. */
export const TIMELINE_EVENT_SOURCES = Symbol("TIMELINE_EVENT_SOURCES");

/**
 * Klinik uyarıları (alerji / kronik durum / ilaç etkileşimi /
 * davranış) timeline'a ekler. Kaynak: `AlertsService.listForPatient`.
 *
 * Title: `title` alanı.
 * Summary: `[severity] description` formatında.
 * actorName: kayıt oluşturan aktörün ID'si (varsa). PII yok;
 *   yalnızca technical identifier.
 */
export class AlertTimelineSource implements TimelineEventSource {
  public readonly eventType = "alert" as const;
  public readonly relatedEntityType = "alert" as const;

  public constructor(private readonly alerts: AlertsService) {}

  public async fetchForPatient(args: {
    tenantId: string;
    patientId: string;
    from?: string;
    to?: string;
    actor: ActorContext;
  }): Promise<TimelineEvent[]> {
    const records: AlertRecord[] = this.alerts.listForPatient(
      args.tenantId,
      args.patientId,
      args.actor,
      // Timeline yalnızca aktif (henüz arşivlenmemiş, süresi
      // geçmemiş) uyarıları gösterir. Geçmiş uyarılar ayrı
      // arşiv görünümünde listelenir (FAZ-3+).
      { activeOnly: true },
    );

    return records.map((r) => ({
      id: `tln-alert-${r.id}`,
      type: "alert",
      occurredAt: r.createdAt,
      title: r.title,
      summary: `[${r.severity}] ${r.description}`,
      relatedEntityType: "alert",
      relatedEntityId: r.id,
      actorName: r.createdBy ?? "system",
    }));
  }
}

/**
 * Sahiplik değişimlerini (initial + transfer) timeline'a ekler.
 * Kaynak: `OwnershipHistoryRepository.search`.
 *
 * Title: `Sahiplik: initial` veya `Sahiplik: transfer` reason'a
 *   göre değişir.
 * Summary: `owner {reason} sebebiyle {newOwnerId}'e devredildi`
 *   formatında. PII yok; yalnızca ID.
 */
export class OwnershipTimelineSource implements TimelineEventSource {
  public readonly eventType = "transfer" as const;
  public readonly relatedEntityType = "ownership" as const;

  public constructor(
    private readonly repo: OwnershipHistoryRepository,
  ) {}

  public async fetchForPatient(args: {
    tenantId: string;
    patientId: string;
    from?: string;
    to?: string;
    actor: ActorContext;
  }): Promise<TimelineEvent[]> {
    const result = this.repo.search(args.tenantId, {
      patientId: args.patientId,
      limit: 200,
      offset: 0,
    });
    return result.items.map((r: Ownership) => this.toEvent(r));
  }

  private toEvent(r: Ownership): TimelineEvent {
    const isInitial = r.reason === "initial";
    const title = isInitial
      ? "İlk sahiplik kaydı"
      : `Sahiplik devri (${r.reason})`;
    const summary = isInitial
      ? `Hasta sahipliği başlangıçta ${r.ownerId} ID'li kişiye atandı.`
      : `Sahiplik ${r.ownerId} ID'li kişiden devralındı. Sebep: ${r.reason}${r.otherNote ? ` (${r.otherNote})` : ""}.`;
    return {
      id: `tln-own-${r.id}`,
      type: "transfer",
      occurredAt: r.startDate,
      title,
      summary,
      relatedEntityType: "ownership",
      relatedEntityId: r.id,
      actorName: r.createdBy ?? "system",
    };
  }
}

/**
 * Hayvana bağlı (relatedEntityType=patient) dosyaları timeline'a
 * ekler. Kaynak: `FilesService` (in-memory store, FAZ-0).
 *
 * Title: `Dosya yüklendi` + kategori.
 * Summary: `originalName (mime, size)`.
 */
export class FileTimelineSource implements TimelineEventSource {
  public readonly eventType = "file" as const;
  public readonly relatedEntityType = "file" as const;

  public constructor(private readonly files: FilesService) {}

  public async fetchForPatient(args: {
    tenantId: string;
    patientId: string;
    from?: string;
    to?: string;
    actor: ActorContext;
  }): Promise<TimelineEvent[]> {
    // FilesService'te until FAZ-0 list endpoint yok; service'in
    // public accessor'ları ile meta'lara tek tek bakılır. Burada
    // service'in tüm meta'larını iterate ederek patient'a bağlı
    // olanları filtreliyoruz (in-memory olduğu için O(n) kabul
    // edilebilir; production'da query ile değiştirilecek).
    const all = this.files.snapshot(args.tenantId, args.actor);
    return all
      .filter(
        (m: FileMeta) =>
          m.relatedEntityType === "patient" &&
          m.relatedEntityId === args.patientId &&
          m.archivedAt === null,
      )
      .map((m: FileMeta) => ({
        id: `tln-file-${m.id}`,
        type: "file" as const,
        occurredAt: m.uploadedAt,
        title: `Dosya yüklendi (${m.category})`,
        summary: `${m.originalName} — ${m.mimeType}, ${m.sizeBytes} bayt`,
        relatedEntityType: "file" as const,
        relatedEntityId: m.id,
        actorName: m.uploadedBy ?? "system",
      }));
  }
}
