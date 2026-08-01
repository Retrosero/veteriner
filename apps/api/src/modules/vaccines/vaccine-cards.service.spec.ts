/**
 * @file VaccineCardsService unit testleri.
 * @module apps/api/modules/vaccines/vaccine-cards.service.spec
 *
 * @description Aşı kartı hesaplama, status çözümleme
 * (overdue/upcoming/completed/not_started), tenant izolasyonu,
 * portal görünürlük kapısı ve tenant portal ayarı yönetimi
 * testleri. DB migration olmadığı için in-memory repo + ledger
 * + mock VaccinesService + mock PatientsService + mock
 * VaccineApplicationsService + mock AuditService kullanılır.
 *
 * @since GOAL-052 (FAZ-5) aşı kartı core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { VaccineCardsRepository } from "./vaccine-cards.repository.js";
import { VaccineCardsService } from "./vaccine-cards.service.js";
import { DomainError } from "../../common/errors/domain-error.js";

import type { VaccineApplicationsService } from "./vaccine-applications.service.js";
import type { VaccinesService } from "./vaccines.service.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Patient } from "../../common/patients/patient.types.js";
import type { PatientsService } from "../patients/patients.service.js";
import type {
  VaccineApplication,
  VaccineProtocol,
  VaccineProtocolListResponse,
} from "@vetniva/contracts";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const VET_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const VET_B: ActorContext = {
  actorId: "usr-vet-b",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const PORTAL_A: ActorContext = {
  actorId: null,
  actorType: "portal_user",
  role: "PET_OWNER_PORTAL",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-3",
  ipAddress: null,
  userAgentHash: null,
  source: "portal_session",
};

/** Mock patient store. */
const patientsStore = new Map<string, Patient>();
function seedPatient(
  tenantId: string,
  id: string,
  species: Patient["species"],
  birthDate: string | null = "2024-01-01",
): void {
  const p: Patient = {
    id,
    tenantId,
    ownerId: `own-${id}`,
    name: species === "dog" ? "Boncuk" : species === "cat" ? "Tekir" : "Mavis",
    species,
    breed: null,
    birthDate,
    gender: "male",
    microchip: null,
    color: null,
    neutered: false,
    notes: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    archivedAt: null,
  };
  patientsStore.set(`${tenantId}|${id}`, p);
}

function makePatients(): PatientsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          patientsStore.get(`${tenantId}|${id}`) ?? null,
      ),
  } as unknown as PatientsService;
}

/** Mock protocol store + service. */
const protocolsStore = new Map<string, VaccineProtocol>();
const appsStore = new Map<string, VaccineApplication[]>();

function seedProtocol(protocol: VaccineProtocol): void {
  protocolsStore.set(`${protocol.tenantId}|${protocol.id}`, protocol);
}

function seedApplication(app: VaccineApplication): void {
  const key = `${app.tenantId}|${app.patientId}`;
  const arr = appsStore.get(key) ?? [];
  arr.push(app);
  appsStore.set(key, arr);
}

function makeVaccines(): VaccinesService {
  return {
    listProtocols: vi
      .fn()
      .mockImplementation(
        async (
          tenantId: string,
          filters: { limit: number; offset: number },
        ): Promise<VaccineProtocolListResponse> => {
          const items: VaccineProtocol[] = [];
          for (const p of protocolsStore.values()) {
            if (p.tenantId !== tenantId) continue;
            if (p.archivedAt !== null) continue;
            items.push(p);
          }
          return {
            items: items.slice(filters.offset, filters.offset + filters.limit),
            total: items.length,
          };
        },
      ),
  } as unknown as VaccinesService;
}

function makeApplications(): VaccineApplicationsService {
  return {
    listByPatient: vi
      .fn()
      .mockImplementation(
        async (
          tenantId: string,
          patientId: string,
          _actor: ActorContext,
          limit: number,
        ): Promise<VaccineApplication[]> => {
          const arr = appsStore.get(`${tenantId}|${patientId}`) ?? [];
          return [...arr]
            .sort((a, b) => b.applicationDate.localeCompare(a.applicationDate))
            .slice(0, limit);
        },
      ),
  } as unknown as VaccineApplicationsService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function validProtocol(
  overrides: Partial<VaccineProtocol> = {},
): VaccineProtocol {
  return {
    id: "vacp-dog-1",
    tenantId: TENANT_A,
    name: "Köpek Karma Aşısı",
    species: "dog",
    category: "core",
    manufacturer: "TestMfr",
    defaultDose: { amount: 1, unit: "ml" },
    steps: [
      { ageWeeks: 8, vaccineName: "DHPP-1", boosterIntervalDays: 21 },
      { ageWeeks: 12, vaccineName: "DHPP-2" },
    ],
    totalDurationMonths: 3,
    isCore: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    createdBy: "usr-vet-a",
    updatedAt: "2025-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function validApplication(
  overrides: Partial<VaccineApplication> = {},
): VaccineApplication {
  return {
    id: "vaca-test-1",
    tenantId: TENANT_A,
    patientId: "pat-dog-1",
    protocolId: "vacp-dog-1",
    lot: {
      lot: "LOT-2026-A",
      expiryDate: "2027-12-31",
      stockProductId: "stkp-vac-1",
    },
    dose: { amount: 1, unit: "ml" },
    administeredBy: "usr-vet-a",
    applicationDate: "2026-01-15T10:00:00.000Z",
    nextDueDate: "2026-02-05",
    notes: null,
    status: "active",
    createdAt: "2026-01-15T10:00:00.000Z",
    createdBy: "usr-vet-a",
    updatedAt: "2026-01-15T10:00:00.000Z",
    amendedAt: null,
    amendedBy: null,
    amendedReason: null,
    cancelledAt: null,
    cancellationReason: null,
    stockMovementIds: ["stmv-1"],
    ...overrides,
  };
}

describe("VaccineCardsService", () => {
  let service: VaccineCardsService;
  let settings: VaccineCardsRepository;
  let vaccines: VaccinesService;
  let patients: PatientsService;
  let applications: VaccineApplicationsService;
  let audit: AuditService;

  beforeEach(() => {
    patientsStore.clear();
    protocolsStore.clear();
    appsStore.clear();

    patients = makePatients();
    vaccines = makeVaccines();
    applications = makeApplications();
    audit = makeAudit();
    settings = new VaccineCardsRepository();

    service = new VaccineCardsService(
      patients,
      vaccines,
      applications,
      settings,
      audit,
    );

    // Varsayılan seed: dog patient + dog protocol.
    seedPatient(TENANT_A, "pat-dog-1", "dog", "2024-01-01");
    seedPatient(TENANT_A, "pat-cat-1", "cat", "2024-06-01");
    seedProtocol(validProtocol());
  });

  // -------------------------------------------------------------------------
  // getVaccineCard
  // -------------------------------------------------------------------------

  describe("getVaccineCard", () => {
    it("başarı: uygulama olmayan hasta için not_started döner", async () => {
      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A);
      expect(card.patientId).toBe("pat-dog-1");
      expect(card.tenantId).toBe(TENANT_A);
      expect(card.species).toBe("dog");
      expect(card.portalVisible).toBe(true);
      expect(card.entries).toHaveLength(1);
      const e = card.entries[0];
      expect(e).toBeDefined();
      expect(e!.status).toBe("not_started");
      expect(e!.completedStepsCount).toBe(0);
      expect(e!.totalStepsCount).toBe(2);
      expect(e!.applications).toHaveLength(0);
      expect(e!.lastApplicationDate).toBeNull();
      expect(card.summary).toEqual({
        overdue: 0,
        upcoming: 0,
        completed: 0,
        notStarted: 1,
      });
    });

    it("başarı: tek step uygulanmış → upcoming (nextDueDate gelecekte)", async () => {
      // applicationDate=2026-01-15, nextDueDate=2026-02-05
      // Default reference = şu an (2026-07 civarı). nextDueDate geçmiş.
      // 2026-07 sonrasında nextDueDate 2026-02-05 → overdue.
      // Bu testte reference=2026-01-20 ile upcoming olduğunu doğrula.
      seedApplication(validApplication());

      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A, {
        upcomingWindowDays: 30,
        referenceDate: "2026-01-20T00:00:00.000Z",
      });
      const e = card.entries[0]!;
      expect(e.completedStepsCount).toBe(1);
      // nextDueDate=2026-02-05, reference=2026-01-20 → 16 gün → upcoming.
      expect(e.daysUntilDue).toBe(16);
      expect(e.status).toBe("upcoming");
      expect(card.summary).toEqual({
        overdue: 0,
        upcoming: 1,
        completed: 0,
        notStarted: 0,
      });
    });

    it("başarı: nextDueDate geçmiş → overdue", async () => {
      seedApplication(validApplication({ nextDueDate: "2026-01-01" }));
      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A, {
        referenceDate: "2026-02-15T00:00:00.000Z",
      });
      const e = card.entries[0]!;
      expect(e.status).toBe("overdue");
      expect(e.daysUntilDue).toBeLessThan(0);
      expect(card.summary.overdue).toBe(1);
    });

    it("başarı: tüm steps + nextDueDate=null → completed", async () => {
      seedApplication(
        validApplication({
          id: "vaca-1",
          protocolId: "vacp-dog-1",
          nextDueDate: null,
        }),
      );
      seedApplication(
        validApplication({
          id: "vaca-2",
          protocolId: "vacp-dog-1",
          nextDueDate: null,
        }),
      );
      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A, {
        referenceDate: "2026-12-01T00:00:00.000Z",
      });
      const e = card.entries[0]!;
      expect(e.completedStepsCount).toBe(2);
      expect(e.status).toBe("completed");
      expect(e.nextDueDate).toBeNull();
      expect(card.summary.completed).toBe(1);
    });

    it("cancelled uygulama completedStepsCount'a katılmaz", async () => {
      seedApplication(validApplication({ id: "vaca-1", status: "cancelled" }));
      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A);
      const e = card.entries[0]!;
      // Cancelled sayılmaz → hâlâ not_started.
      expect(e.completedStepsCount).toBe(0);
      expect(e.status).toBe("not_started");
      // Ama applications listesinde cancelled görünür (geçmiş).
      expect(e.applications).toHaveLength(1);
    });

    it("amended uygulama completedStepsCount'a katılır", async () => {
      seedApplication(validApplication({ id: "vaca-1", status: "amended" }));
      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A, {
        referenceDate: "2026-02-15T00:00:00.000Z",
      });
      const e = card.entries[0]!;
      expect(e.completedStepsCount).toBe(1);
    });

    it("lastApplicationBy ve lastLot son aktif uygulamadan gelir", async () => {
      seedApplication(
        validApplication({
          id: "vaca-1",
          administeredBy: "usr-vet-1",
          applicationDate: "2026-01-10T10:00:00.000Z",
          lot: {
            lot: "LOT-OLD",
            expiryDate: "2027-06-30",
            stockProductId: "stkp-1",
          },
        }),
      );
      seedApplication(
        validApplication({
          id: "vaca-2",
          administeredBy: "usr-vet-2",
          applicationDate: "2026-01-20T10:00:00.000Z",
          lot: {
            lot: "LOT-NEW",
            expiryDate: "2027-12-31",
            stockProductId: "stkp-1",
          },
        }),
      );
      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A, {
        referenceDate: "2026-01-22T00:00:00.000Z",
      });
      const e = card.entries[0]!;
      // lastApplicationDate = en yeni (sort edilmiş liste başı).
      expect(e.lastApplicationDate).toBe("2026-01-20T10:00:00.000Z");
      // lastApplicationBy = son aktif/amended uygulama.
      expect(e.lastApplicationBy).toBe("usr-vet-2");
      expect(e.lastLot?.lot).toBe("LOT-NEW");
    });

    it("species uyumsuz protokol entry'ye girmez", async () => {
      // Cat protocol ekle (cat patient için) — ama pat-dog-1 dog.
      seedProtocol(
        validProtocol({
          id: "vacp-cat-1",
          name: "Kedi Karma Aşısı",
          species: "cat",
        }),
      );
      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A);
      // Sadece dog protokolü görünmeli.
      expect(card.entries).toHaveLength(1);
      expect(card.entries[0]!.protocol.id).toBe("vacp-dog-1");
    });

    it("'all' species protokolü tüm hastalara uygulanır", async () => {
      seedProtocol(
        validProtocol({
          id: "vacp-all-1",
          name: "Kuduz Aşısı",
          species: "all",
        }),
      );
      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A);
      // 2 protokol: dog + all.
      expect(card.entries).toHaveLength(2);
      const ids = card.entries
        .map((e: { protocol: { id: string } }) => e.protocol.id)
        .sort();
      expect(ids).toEqual(["vacp-all-1", "vacp-dog-1"]);
    });

    it("'other' species hasta tüm protokolleri görür", async () => {
      seedPatient(TENANT_A, "pat-other-1", "other");
      seedProtocol(
        validProtocol({
          id: "vacp-cat-1",
          name: "Kedi Karma Aşısı",
          species: "cat",
        }),
      );
      const card = await service.getVaccineCard(TENANT_A, "pat-other-1", VET_A);
      // dog + cat + all (default) — ama cat'i seedProtocol ile ekledik, 3 entry.
      // Not: validProtocol default 'all' değil, 'dog'. all eklemek istersek
      // ayrıca ekleyebiliriz. Burada dog + cat = 2 bekliyoruz.
      expect(card.entries.length).toBeGreaterThanOrEqual(2);
    });

    it("archived protokol entry'ye girmez", async () => {
      seedProtocol(
        validProtocol({
          id: "vacp-dog-2",
          archivedAt: "2025-12-01T00:00:00.000Z",
        }),
      );
      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A);
      // mock listProtocols archived filtreliyor.
      expect(card.entries).toHaveLength(1);
    });

    it("cross-tenant patient → 404 VET-CLINIC-0001", async () => {
      // TENANT_B user, ama patientId TENANT_A'da.
      await expect(
        service.getVaccineCard(TENANT_B, "pat-dog-1", VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });

    it("cross-tenant patientId URL'de → 403 VET-AUTHZ-0001 (tenant scope)", async () => {
      // Actor kendi tenantId'si dışındaki bir tenantId'yi sorgular.
      // Bu durumda VET_A kendi tenant'ıyla ama URL'de başka tenantId.
      await expect(
        service.getVaccineCard(TENANT_B, "pat-dog-1", VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("patient bulunamadı → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.getVaccineCard(TENANT_A, "pat-nonexistent", VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
      });
    });

    it("superadmin başka tenant'a erişebilir", async () => {
      const SUPERADMIN: ActorContext = {
        ...VET_A,
        role: "SUPERADMIN",
        tenantId: null,
        isSuperadmin: true,
      };
      const card = await service.getVaccineCard(
        TENANT_A,
        "pat-dog-1",
        SUPERADMIN,
      );
      expect(card.patientId).toBe("pat-dog-1");
    });

    it("entries status'a göre sıralanır: overdue → upcoming → not_started → completed", async () => {
      // 3 protokol: dog (not_started), cat (upcoming), all (overdue).
      seedProtocol(
        validProtocol({
          id: "vacp-cat-1",
          name: "Kedi",
          species: "cat",
          steps: [{ ageWeeks: 8, vaccineName: "FVR-1" }],
          totalDurationMonths: 2,
        }),
      );
      seedProtocol(
        validProtocol({
          id: "vacp-all-1",
          name: "Kuduz",
          species: "all",
          steps: [{ ageWeeks: 12, vaccineName: "Rabies" }],
          totalDurationMonths: 3,
        }),
      );
      // Cat uygulaması (upcoming).
      seedPatient(TENANT_A, "pat-cat-1", "cat", "2024-06-01");
      seedApplication(
        validApplication({
          id: "vaca-cat-1",
          tenantId: TENANT_A,
          patientId: "pat-cat-1",
          protocolId: "vacp-cat-1",
          applicationDate: "2026-01-10T00:00:00.000Z",
          nextDueDate: "2026-02-10",
        }),
      );
      // Kuduz uygulaması (overdue: nextDueDate 2025-01-01).
      seedApplication(
        validApplication({
          id: "vaca-rab-1",
          tenantId: TENANT_A,
          patientId: "pat-dog-1",
          protocolId: "vacp-all-1",
          applicationDate: "2024-01-01T00:00:00.000Z",
          nextDueDate: "2025-01-01",
        }),
      );

      const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A, {
        referenceDate: "2026-02-15T00:00:00.000Z",
      });
      // pat-dog-1 için: dog (not_started) + kuduz (overdue).
      const statuses = card.entries.map((e: { status: string }) => e.status);
      // İlk overdue olmalı.
      expect(statuses[0]).toBe("overdue");
      expect(statuses).toContain("not_started");
    });
  });

  // -------------------------------------------------------------------------
  // getPortalVaccineCard
  // -------------------------------------------------------------------------

  describe("getPortalVaccineCard", () => {
    it("tenant portal ayarı açık (default) → kart döner", async () => {
      const card = await service.getPortalVaccineCard(
        TENANT_A,
        "pat-dog-1",
        PORTAL_A,
      );
      expect(card.patientId).toBe("pat-dog-1");
      expect(card.portalVisible).toBe(true);
    });

    it("tenant portal ayarı kapalı → 403 VET-AUTHZ-0002", async () => {
      settings.upsert({
        tenantId: TENANT_A,
        portalVaccineCardEnabled: false,
      });
      await expect(
        service.getPortalVaccineCard(TENANT_A, "pat-dog-1", PORTAL_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0002",
        httpStatus: 403,
      });
    });

    it("cross-tenant patient → 404 VET-CLINIC-0001", async () => {
      const PORTAL_B: ActorContext = { ...PORTAL_A, tenantId: TENANT_B };
      await expect(
        service.getPortalVaccineCard(TENANT_B, "pat-dog-1", PORTAL_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
      });
    });

    it("cross-tenant URL tenantId → 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.getPortalVaccineCard(TENANT_B, "pat-dog-1", PORTAL_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Tenant portal ayarı
  // -------------------------------------------------------------------------

  describe("getPortalSetting / updatePortalSetting", () => {
    it("ayar yoksa default true döner", async () => {
      const s = await service.getPortalSetting(TENANT_A, VET_A);
      expect(s.portalVaccineCardEnabled).toBe(true);
      expect(s.tenantId).toBe(TENANT_A);
    });

    it("update sonrası yeni değer döner + audit yayınlanır", async () => {
      const s = await service.updatePortalSetting(
        TENANT_A,
        { portalVaccineCardEnabled: false },
        VET_A,
      );
      expect(s.portalVaccineCardEnabled).toBe(false);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.card.portal_setting.update",
        "tenant_vaccine_card_setting",
        TENANT_A,
        "update",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ portalVaccineCardEnabled: false }),
      );
    });

    it("update sonrası getPortalSetting güncellenmiş değeri döner", async () => {
      await service.updatePortalSetting(
        TENANT_A,
        { portalVaccineCardEnabled: true },
        VET_A,
      );
      const s = await service.getPortalSetting(TENANT_A, VET_A);
      expect(s.portalVaccineCardEnabled).toBe(true);
      expect(s.updatedAt).toBeTruthy();
    });

    it("cross-tenant update → 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.updatePortalSetting(
          TENANT_B,
          { portalVaccineCardEnabled: false },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
      });
    });
  });

  // -------------------------------------------------------------------------
  // DomainError shape
  // -------------------------------------------------------------------------

  describe("DomainError shape", () => {
    it("hata code + httpStatus + i18nKey doğru", async () => {
      try {
        await service.getVaccineCard(TENANT_A, "pat-nonexistent", VET_A);
        expect.fail("beklenen hata");
      } catch (err) {
        expect(err).toBeInstanceOf(DomainError);
        const e = err as DomainError;
        expect(e.errorCode).toBe("VET-CLINIC-0001");
        expect(e.httpStatus).toBe(404);
        expect(e.i18nKey).toBe("error.VET-CLINIC-0001");
        expect(e.severity).toBe("warning");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Smoke
  // -------------------------------------------------------------------------

  it("smoke: sıralama + summary tutarlı", async () => {
    seedApplication(validApplication());
    const card = await service.getVaccineCard(TENANT_A, "pat-dog-1", VET_A, {
      referenceDate: "2026-01-20T00:00:00.000Z",
    });
    // 1 entry: dog, 1 step uygulanmış, nextDueDate 2026-02-05 → upcoming.
    expect(card.entries).toHaveLength(1);
    const e = card.entries[0]!;
    expect(e.protocol.id).toBe("vacp-dog-1");
    expect(e.applications).toHaveLength(1);
    expect(e.lastApplicationBy).toBe("usr-vet-a");
    expect(card.summary.upcoming).toBe(1);
    expect(
      card.summary.overdue + card.summary.completed + card.summary.notStarted,
    ).toBe(0);
  });
});
