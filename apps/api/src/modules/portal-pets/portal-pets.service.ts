/**
 * @file Portal pets service.
 * @module apps/api/modules/portal-pets/portal-pets.service
 *
 * @description GOAL-034 hasta sahibi portal — kendi hayvanlarını
 * listeleme (`list`) ve tek hayvan detayı (`getDetail`) iş
 * kuralları. Personel `PatientsService`'ten farklıdır: hasta
 * verisi yalnızca `PortalUser.ownerId` ile eşleşen kayıtlar
 * döner; cross-owner erişim 404 ile maskelenir (bilgi
 * sızdırmaz).
 *
 * İş kuralları:
 * - `list`: PortalUser kaydı bulunamazsa boş liste (controller
 *   zaten authenticated olduğundan bu durum normalde olmaz);
 *   owner'a ait aktif (archivedAt=null) hastalar; sıralama
 *   oluşturulma tarihi desc; her hasta için `lastVisitAt` son
 *   `completed` randevudan türetilir; `photoUrl` FAZ-0'da
 *   `undefined` (FileService entegrasyonu sonra).
 * - `getDetail`: cross-tenant patient → 404; archived hasta →
 *   404; owner eşleşmezse → 404 (bilgi sızdırmaz). `alertsCount`
 *   `AlertsService.getActiveAlertsForPatient` üzerinden. Sonraki
 *   aşı tarihi FAZ-0'da `undefined` (vaccination modülü yok).
 *
 * @security
 * - Tenant bilgisi yalnızca session/actor üzerinden alınır.
 * - Hasta kaydı `archivedAt !== null` ise detay döndürülmez
 *   (kimlik gizleme).
 * - Owner uyuşmazlığı bilgi sızdırmamak için 404 ile
 *   maskelenir; 403 kullanılmaz.
 *
 * @since GOAL-034 (FAZ-3) portal hayvan listesi ve detayı
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type { PortalPetDetail, PortalPetSummary } from "@vetniva/contracts";

import { AlertsService } from "../alerts/alerts.service.js";
import { AppointmentsService } from "../appointments/appointments.service.js";
import { PatientsService } from "../patients/patients.service.js";
import { PortalAuthService } from "../portal-auth/portal-auth.service.js";

@Injectable()
export class PortalPetsService {
  private readonly logger = new Logger(PortalPetsService.name);

  public constructor(
    private readonly portalAuth: PortalAuthService,
    private readonly patients: PatientsService,
    private readonly alerts: AlertsService,
    private readonly appointments: AppointmentsService,
  ) {}

  // ===========================================================================
  // LIST
  // ===========================================================================

  /**
   * Portal kullanıcısının sahip olduğu aktif hayvanları listeler.
   * Her öğeye son completed randevu tarihi eklenir.
   */
  public async list(
    tenantId: string,
    portalUserId: string,
    actor: ActorContext,
  ): Promise<PortalPetSummary[]> {
    this.requireTenantScope(actor, tenantId);

    const portalUser = this.portalAuth.findById(tenantId, portalUserId);
    if (!portalUser) {
      // Oturum aktifken portal user silinmiş olabilir; boş dön.
      return [];
    }
    const ownerId = portalUser.ownerId;

    // ownerId'nin tenant kapsamı zaten portalUser'da tutuluyor; ekstra
    // tenant idor kontrolü gerekmez. Aktif (archivedAt=null) hastalar.
    const result = await this.patients.search(
      tenantId,
      { ownerId, limit: 200, offset: 0 },
      actor,
    );

    const summaries: PortalPetSummary[] = [];
    for (const patient of result.items) {
      const lastVisitAt = await this.findLastCompletedVisit(
        tenantId,
        patient.id,
        actor,
      );
      const summary: PortalPetSummary = {
        id: patient.id,
        name: patient.name,
        species: patient.species,
        breed: patient.breed,
        birthDate: patient.birthDate,
        lastVisitAt,
        // photoUrl: FAZ-0'da FileService entegrasyonu sonrası dolar.
      };
      summaries.push(summary);
    }
    return summaries;
  }

  // ===========================================================================
  // DETAIL
  // ===========================================================================

  /**
   * Portal kullanıcısının sahip olduğu tek hayvanın detayı.
   * Cross-tenant, archived, veya başka sahibin hayvanı → 404.
   */
  public async getDetail(
    tenantId: string,
    portalUserId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<PortalPetDetail> {
    this.requireTenantScope(actor, tenantId);

    // 1) Portal user → ownerId.
    const portalUser = this.portalAuth.findById(tenantId, portalUserId);
    if (!portalUser) {
      throw this.notFound(patientId);
    }

    // 2) Cross-tenant + archived hasta kontrolü (PatientsService
    //    findById archived kayıtları döndürür; kontrolü burada
    //    yapıyoruz çünkü portal sürümünde arşivli hastalar 404).
    const patient = await this.patients.findById(tenantId, patientId, actor);
    if (!patient || patient.archivedAt !== null) {
      throw this.notFound(patientId);
    }

    // 3) Owner eşleşmesi (bilgi sızdırmamak için 404).
    if (patient.ownerId !== portalUser.ownerId) {
      throw this.notFound(patientId);
    }

    // 4) Aktif uyarı sayısı.
    const activeAlerts = this.alerts.getActiveAlertsForPatient(
      tenantId,
      patient.id,
      actor,
    );

    // 5) Sıradaki aşı tarihi: FAZ-0'da vaccination modülü yok;
    //    ileride VaccinationService.getNextScheduledForPatient ile dolar.
    const nextVaccinationDate = await this.findNextVaccinationDate(
      tenantId,
      patient.id,
      actor,
    );

    const detail: PortalPetDetail = {
      id: patient.id,
      name: patient.name,
      species: patient.species,
      breed: patient.breed,
      birthDate: patient.birthDate,
      gender: patient.gender,
      microchip: patient.microchip,
      color: patient.color,
      neutered: patient.neutered,
      notes: patient.notes,
      ownerId: patient.ownerId,
      alertsCount: activeAlerts.length,
      ...(nextVaccinationDate !== undefined ? { nextVaccinationDate } : {}),
    };
    return detail;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Son `completed` randevunun `start` zamanını döner. Hiç yoksa
   * `undefined`. AppointmentsService.list status filtresi ile
   * kullanılır; sonra desc sıralanır.
   */
  private async findLastCompletedVisit(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<string | undefined> {
    const result = await this.appointments.list(
      tenantId,
      { patientId, status: "completed", limit: 200, offset: 0 },
      actor,
    );
    if (result.items.length === 0) return undefined;
    const sorted = [...result.items].sort((a, b) =>
      b.start.localeCompare(a.start),
    );
    return sorted[0]?.start;
  }

  /**
   * Sıradaki planlanmış aşı tarihi. FAZ-0'da vaccination modülü
   * olmadığından her zaman `undefined`; ileride
   * `VaccinationService.getNextScheduledForPatient(patientId)` ile
   * değiştirilecek.
   */
  private async findNextVaccinationDate(
    _tenantId: string,
    _patientId: string,
    _actor: ActorContext,
  ): Promise<string | undefined> {
    return undefined;
  }

  private notFound(patientId: string): DomainError {
    return new DomainError({
      errorCode: "VET-CLINIC-0001",
      message: "Hayvan bulunamadı",
      httpStatus: 404,
      severity: "info",
      i18nKey: "error.VET-CLINIC-0001",
      details: { patientId },
    });
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
