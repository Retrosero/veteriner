/**
 * @file PortalPetsService unit testleri.
 * @module apps/api/modules/portal-pets/portal-pets.service.spec
 *
 * @description Owner filtresi, archived hasta eleme, cross-tenant
 * 404, owner uyuşmazlığı 404, aktif uyarı sayısı doğruluğu.
 * Audit mock'lanır; in-memory repository'ler ve stub
 * AppointmentsService kullanılır (lastVisitAt FAZ-0'da türetilmiyor).
 *
 * @since GOAL-034 (FAZ-3) portal hayvan listesi ve detayı
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { AlertsService } from "../alerts/alerts.service.js";
import type { AppointmentsService } from "../appointments/appointments.service.js";
import { PatientsService } from "../patients/patients.service.js";
import { PortalAuthService } from "../portal-auth/portal-auth.service.js";
import { PortalAuthRepository } from "../portal-auth/portal-auth.repository.js";
import { OwnersService } from "../owners/owners.service.js";
import { PatientsRepository } from "../patients/patients.repository.js";
import { OwnershipHistoryService } from "../ownership-history/ownership-history.service.js";

import { PortalPetsService } from "./portal-pets.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OWNER_A = "own-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER_B = "own-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PORTAL_USER_A = "pusr-portal-a";

const PORTAL_ACTOR: ActorContext = {
  actorId: null,
  actorType: "portal_user",
  role: "PET_OWNER_PORTAL",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-portal-1",
  ipAddress: null,
  userAgentHash: null,
  source: "portal_session",
};

const STAFF_ACTOR: ActorContext = {
  ...PORTAL_ACTOR,
  actorId: "usr-staff",
  actorType: "user",
  role: "STAFF",
};

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function makePatientsService(patientRepo: PatientsRepository): PatientsService {
  // PatientsService tam DI ağacı kurmak test maliyetini artırır;
  // sadece search + findById + listActiveAlertsForPatient yeterli
  // olduğundan minimum bağımlılıkla inşa ediyoruz.
  const owners = new OwnersService({} as never, makeAudit());
  const ownership = new OwnershipHistoryService(
    {} as never,
    patientRepo,
    owners,
    makeAudit(),
  );
  return new PatientsService(
    owners,
    patientRepo,
    makeAudit(),
    ownership,
    new AlertsService(patientRepo, makeAudit()),
  );
}

function makeAppointmentsStub(): AppointmentsService {
  // list her zaman boş döner; lastVisitAt undefined kalır.
  return {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  } as unknown as AppointmentsService;
}

function seedPortalUser(
  repo: PortalAuthRepository,
  ownerId: string,
  id: string = PORTAL_USER_A,
): void {
  repo.insertPortalUser({
    id,
    tenantId: TENANT_A,
    ownerId,
    email: "owner@example.com",
    passwordHash: "h",
    status: "active",
    consentKvkk: true,
    consentKvkkAt: new Date().toISOString(),
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    patientIds: [],
    displayName: null,
    locale: "tr-TR",
    invitationId: null,
    emailVerified: false,
    emailVerifiedAt: null,
  });
}

function seedPatient(
  repo: PatientsRepository,
  ownerId: string,
  opts: {
    archived?: boolean;
    name?: string;
    tenantId?: string;
  } = {},
): string {
  const id = `pat-${Math.random().toString(36).slice(2, 8)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const rec = repo.toRecord(id, opts.tenantId ?? TENANT_A, {
    ownerId,
    name: opts.name ?? "Boncuk",
    species: "dog",
    gender: "male",
    neutered: false,
  });
  if (opts.archived) {
    rec.archivedAt = new Date().toISOString();
  }
  repo.insert(rec);
  return id;
}

describe("PortalPetsService", () => {
  let patientRepo: PatientsRepository;
  let portalAuthRepo: PortalAuthRepository;
  let patients: PatientsService;
  let alerts: AlertsService;
  let appointments: AppointmentsService;
  let portalAuth: PortalAuthService;
  let service: PortalPetsService;

  beforeEach(() => {
    patientRepo = new PatientsRepository();
    portalAuthRepo = new PortalAuthRepository();
    patients = makePatientsService(patientRepo);
    alerts = new AlertsService(patientRepo, makeAudit());
    appointments = makeAppointmentsStub();
    portalAuth = new PortalAuthService(portalAuthRepo, makeAudit(), {} as never);
    service = new PortalPetsService(
      portalAuth,
      patients,
      alerts,
      appointments,
    );
  });

  // ===========================================================================
  // LIST
  // ===========================================================================

  describe("list", () => {
    it("owner'a ait 3 aktif hayvanı listeler", async () => {
      seedPortalUser(portalAuthRepo, OWNER_A);
      // OWNER_A altında 3, OWNER_B altında 1 hasta.
      seedPatient(patientRepo, OWNER_A, { name: "A" });
      seedPatient(patientRepo, OWNER_A, { name: "B" });
      seedPatient(patientRepo, OWNER_A, { name: "C" });
      seedPatient(patientRepo, OWNER_B, { name: "D" });

      const result = await service.list(TENANT_A, PORTAL_USER_A, PORTAL_ACTOR);
      expect(result).toHaveLength(3);
      const names = result.map((r) => r.name).sort();
      expect(names).toEqual(["A", "B", "C"]);
      // lastVisitAt stub: undefined.
      for (const item of result) {
        expect(item.lastVisitAt).toBeUndefined();
      }
    });

    it("archived hasta listede yok", async () => {
      seedPortalUser(portalAuthRepo, OWNER_A);
      seedPatient(patientRepo, OWNER_A, { name: "Active" });
      seedPatient(patientRepo, OWNER_A, { name: "Archived", archived: true });

      const result = await service.list(TENANT_A, PORTAL_USER_A, PORTAL_ACTOR);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("Active");
    });

    it("portal user bulunamazsa boş liste döner", async () => {
      seedPatient(patientRepo, OWNER_A, { name: "Orphan" });
      const result = await service.list(TENANT_A, "missing-portal", PORTAL_ACTOR);
      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // DETAIL
  // ===========================================================================

  describe("getDetail", () => {
    it("başarılı detay döner", async () => {
      seedPortalUser(portalAuthRepo, OWNER_A);
      const patientId = seedPatient(patientRepo, OWNER_A, { name: "Karabas" });

      const detail = await service.getDetail(
        TENANT_A,
        PORTAL_USER_A,
        patientId,
        PORTAL_ACTOR,
      );
      expect(detail.id).toBe(patientId);
      expect(detail.name).toBe("Karabas");
      expect(detail.ownerId).toBe(OWNER_A);
      expect(detail.alertsCount).toBe(0);
      // Opsiyonel alanlar FAZ-0'da tanımsız.
      expect(detail.nextVaccinationDate).toBeUndefined();
    });

    it("cross-tenant patient → 404 VET-CLINIC-0001", async () => {
      seedPortalUser(portalAuthRepo, OWNER_A);
      const patientId = seedPatient(patientRepo, OWNER_A, {
        name: "CrossTenant",
        tenantId: TENANT_B,
      });
      try {
        await service.getDetail(TENANT_A, PORTAL_USER_A, patientId, PORTAL_ACTOR);
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect(err.errorCode).toBe("VET-CLINIC-0001");
        expect(err.httpStatus).toBe(404);
      }
    });

    it("başka owner'ın hastası → 404 (bilgi sızdırmaz)", async () => {
      seedPortalUser(portalAuthRepo, OWNER_A);
      const patientId = seedPatient(patientRepo, OWNER_B, { name: "OtherOwner" });
      try {
        await service.getDetail(TENANT_A, PORTAL_USER_A, patientId, PORTAL_ACTOR);
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect(err.errorCode).toBe("VET-CLINIC-0001");
        expect(err.httpStatus).toBe(404);
      }
    });

    it("archived hasta → 404", async () => {
      seedPortalUser(portalAuthRepo, OWNER_A);
      const patientId = seedPatient(patientRepo, OWNER_A, {
        name: "Archived",
        archived: true,
      });
      try {
        await service.getDetail(TENANT_A, PORTAL_USER_A, patientId, PORTAL_ACTOR);
        expect.fail("Hata fırlamalıydı");
      } catch (e) {
        const err = e as { errorCode: string; httpStatus: number };
        expect(err.errorCode).toBe("VET-CLINIC-0001");
        expect(err.httpStatus).toBe(404);
      }
    });

    it("aktif uyarı sayısı doğru döner (2 aktif, 1 arşivli)", async () => {
      seedPortalUser(portalAuthRepo, OWNER_A);
      const patientId = seedPatient(patientRepo, OWNER_A, { name: "Allergic" });

      await alerts.add(
        TENANT_A,
        patientId,
        {
          category: "allergy",
          severity: "warning",
          title: "Penisilin alerjisi",
          description: "Penisilin alerjisi",
        },
        STAFF_ACTOR,
      );
      await alerts.add(
        TENANT_A,
        patientId,
        {
          category: "chronic_condition",
          severity: "info",
          title: "Diyabet",
          description: "Tip 1 diyabet",
        },
        STAFF_ACTOR,
      );
      const archived = await alerts.add(
        TENANT_A,
        patientId,
        {
          category: "behavior",
          severity: "info",
          title: "Eski uyarı",
          description: "Arşivlendi",
        },
        STAFF_ACTOR,
      );
      await alerts.archive(TENANT_A, archived.id, STAFF_ACTOR);

      const detail = await service.getDetail(
        TENANT_A,
        PORTAL_USER_A,
        patientId,
        PORTAL_ACTOR,
      );
      expect(detail.alertsCount).toBe(2);
    });
  });
});
