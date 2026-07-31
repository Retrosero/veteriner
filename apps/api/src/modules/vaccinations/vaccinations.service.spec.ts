/**
 * @file VaccinationsService unit testleri.
 * @module apps/api/modules/vaccinations/vaccinations.service.spec
 *
 * @description Aşı uygulama kaydı oluşturma, tenant izolasyonu,
 * protokol/patient doğrulaması, lot tekilliği, sonraki tarih
 * türetme, getNextDue / getOverdue, iptal + audit event yayını.
 * DB migration olmadığı için in-memory repo + mock
 * VaccinesService + mock PatientsService + mock AuditService
 * kullanılır.
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Patient } from "../../common/patients/patient.types.js";
import type { PatientsService } from "../patients/patients.service.js";
import type { VaccinesService } from "../vaccines/vaccines.service.js";
import type { VaccineProtocol } from "@vetniva/contracts";

import { VaccinationsService } from "./vaccinations.service.js";
import { VaccinationsRepository } from "./vaccinations.repository.js";

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

/** Mock patient store. */
const patientsStore = new Map<string, Patient>();
function seedPatient(tenantId: string, id: string, species: Patient["species"]): void {
  const p: Patient = {
    id,
    tenantId,
    ownerId: `own-${id}`,
    name: species === "dog" ? "Boncuk" : species === "cat" ? "Tekir" : "Mavis",
    species,
    breed: null,
    birthDate: null,
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
function seedProtocol(protocol: VaccineProtocol): void {
  protocolsStore.set(`${protocol.tenantId}|${protocol.id}`, protocol);
}
function makeVaccines(): VaccinesService {
  return {
    getProtocol: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          protocolsStore.get(`${tenantId}|${id}`) ?? null,
      ),
  } as unknown as VaccinesService;
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
    id: "vacp-test-1",
    tenantId: TENANT_A,
    name: "Köpek Core Aşı Takvimi",
    species: "dog",
    category: "core",
    manufacturer: "TestMfr",
    defaultDose: { amount: 1, unit: "ml" },
    steps: [
      { ageWeeks: 8, vaccineName: "DHPP-1" },
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

function validInput(
  overrides: Partial<{
    patientId: string;
    protocolId: string;
    vaccineName: string;
    dose: string;
    lotNumber: string;
    manufacturer: string;
    administeredAt: string | undefined;
    notes: string;
  }> = {},
) {
  return {
    patientId: "pat-dog-1",
    protocolId: "vacp-test-1",
    vaccineName: "DHPP-1",
    dose: "1 ml",
    lotNumber: "LOT-2026-A",
    manufacturer: "TestMfr",
    administeredAt: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("VaccinationsService", () => {
  let service: VaccinationsService;
  let repo: VaccinationsRepository;
  let vaccines: VaccinesService;
  let patients: PatientsService;
  let audit: AuditService;

  beforeEach(() => {
    repo = new VaccinationsRepository();
    vaccines = makeVaccines();
    patients = makePatients();
    audit = makeAudit();

    service = new VaccinationsService(repo, patients, vaccines, audit);

    patientsStore.clear();
    protocolsStore.clear();

    // Varsayılan seed: dog patient + dog protocol.
    seedPatient(TENANT_A, "pat-dog-1", "dog");
    seedProtocol(validProtocol());
  });

  // -------------------------------------------------------------------------
  // record
  // -------------------------------------------------------------------------

  describe("record", () => {
    it("başarı: kayıt oluşur + status=administered + nextDueAt türetilir + audit.create (info)", async () => {
      const v = await service.record(TENANT_A, validInput(), VET_A);
      expect(v.id).toMatch(/^vacr-/);
      expect(v.patientId).toBe("pat-dog-1");
      expect(v.protocolId).toBe("vacp-test-1");
      expect(v.status).toBe("administered");
      expect(v.veterinarianId).toBe("usr-vet-a");
      expect(v.lotNumber).toBe("LOT-2026-A");
      expect(v.manufacturer).toBe("TestMfr");
      expect(v.notes).toBeNull();
      expect(v.cancelledAt).toBeNull();

      // 2-step protocol: fark 12-8 = 4 hafta = 28 gün.
      // administeredAt = 2026-01-15T10:00:00.000Z → +28gün =
      // 2026-02-12T10:00:00.000Z.
      expect(v.nextDueAt).toBe("2026-02-12T10:00:00.000Z");

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccination.create",
        "vaccination",
        v.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          patientId: "pat-dog-1",
          protocolId: "vacp-test-1",
          lotNumber: "LOT-2026-A",
          nextDueAt: v.nextDueAt,
        }),
      );
    });

    it("tek step + boosterIntervalDays → nextDueAt o kadar gün sonra", async () => {
      seedProtocol(
        validProtocol({
          id: "vacp-single",
          steps: [{ ageWeeks: 8, vaccineName: "Rabies", boosterIntervalDays: 365 }],
        }),
      );
      const v = await service.record(
        TENANT_A,
        validInput({ protocolId: "vacp-single", lotNumber: "LOT-R-1" }),
        VET_A,
      );
      // 2026-01-15 + 365 gün = 2027-01-15.
      expect(v.nextDueAt).toBe("2027-01-15T10:00:00.000Z");
    });

    it("patient cross-tenant → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.record(TENANT_B, validInput(), VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("protocol cross-tenant → 404 VET-VACC-0004", async () => {
      // patient TENANT_B'de (validation geçer), protocol yalnızca
      // TENANT_A'da → protocol cross-tenant 404.
      seedPatient(TENANT_B, "pat-dog-b", "dog");
      await expect(
        service.record(
          TENANT_B,
          validInput({ patientId: "pat-dog-b" }),
          VET_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0004",
        httpStatus: 404,
      });
    });

    it("duplicate lot (tenant+protocol) → 409 VET-VACC-0003", async () => {
      await service.record(TENANT_A, validInput(), VET_A);
      await expect(
        service.record(
          TENANT_A,
          validInput({ vaccineName: "DHPP-2" }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0003",
        httpStatus: 409,
        details: { lotNumber: "LOT-2026-A" },
      });
    });

    it("iptal edilmiş kayıt lot'u tekrar kullanılabilir", async () => {
      const a = await service.record(TENANT_A, validInput(), VET_A);
      await service.cancel(TENANT_A, a.id, "yanlış kayıt", VET_A);
      // Aynı lot ile yeni kayıt oluşabilmeli.
      const v = await service.record(
        TENANT_A,
        validInput({ vaccineName: "DHPP-2" }),
        VET_A,
      );
      expect(v.status).toBe("administered");
      expect(v.lotNumber).toBe("LOT-2026-A");
    });

    it("administeredAt verilmezse now() kullanılır", async () => {
      const v = await service.record(
        TENANT_A,
        validInput({ administeredAt: undefined }),
        VET_A,
      );
      expect(v.administeredAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe("list", () => {
    it("patientId filtresi", async () => {
      await service.record(TENANT_A, validInput(), VET_A);
      seedPatient(TENANT_A, "pat-cat-1", "cat");
      seedProtocol(
        validProtocol({ id: "vacp-cat", species: "cat" }),
      );
      await service.record(
        TENANT_A,
        validInput({
          patientId: "pat-cat-1",
          protocolId: "vacp-cat",
          lotNumber: "LOT-CAT-1",
        }),
        VET_A,
      );
      const r = await service.list(
        TENANT_A,
        { patientId: "pat-dog-1" },
        VET_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.patientId).toBe("pat-dog-1");
    });

    it("cross-tenant → boş liste", async () => {
      await service.record(TENANT_A, validInput(), VET_A);
      const r = await service.list(TENANT_B, {}, VET_B);
      expect(r.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe("findById", () => {
    it("cross-tenant → null", async () => {
      const v = await service.record(TENANT_A, validInput(), VET_A);
      const found = await service.findById(TENANT_B, v.id, VET_B);
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getNextDue / getOverdue
  // -------------------------------------------------------------------------

  describe("getNextDue / getOverdue", () => {
    it("getNextDue: gelecekteki nextDueAt döner", async () => {
      // administeredAt dünden 1 gün önce → nextDueAt
      // (= administeredAt + 28 gün) yaklaşık 27 gün sonra,
      // yani gelecekte.
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      const v = await service.record(
        TENANT_A,
        validInput({ administeredAt: yesterday }),
        VET_A,
      );
      const list = await service.getNextDue(
        TENANT_A,
        "pat-dog-1",
        VET_A,
      );
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe(v.id);
    });

    it("getOverdue: geçmişteki nextDueAt döner", async () => {
      // administeredAt çok eski → nextDueAt da geçmiş.
      await service.record(
        TENANT_A,
        validInput({ administeredAt: "2020-01-15T10:00:00.000Z" }),
        VET_A,
      );
      const overdue = await service.getOverdue(
        TENANT_A,
        "pat-dog-1",
        VET_A,
      );
      expect(overdue).toHaveLength(1);
      const nextDue = await service.getNextDue(
        TENANT_A,
        "pat-dog-1",
        VET_A,
      );
      expect(nextDue).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("başarı: status=cancelled + cancelledAt + cancellationReason + audit.cancel (warning)", async () => {
      const v = await service.record(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const cancelled = await service.cancel(
        TENANT_A,
        v.id,
        "yanlış kayıt",
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancellationReason).toBe("yanlış kayıt");
      expect(cancelled.cancelledAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccination.cancel",
        "vaccination",
        v.id,
        "cancel",
        expect.objectContaining({ tenantId: TENANT_A }),
        "warning",
        expect.objectContaining({ reason: "yanlış kayıt" }),
      );
    });

    it("zaten iptal edilmiş → 409 VET-VACC-0008", async () => {
      const v = await service.record(TENANT_A, validInput(), VET_A);
      await service.cancel(TENANT_A, v.id, "iptal", VET_A);
      await expect(
        service.cancel(TENANT_A, v.id, "tekrar", VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0008",
        httpStatus: 409,
      });
    });

    it("cross-tenant iptal → 404 VET-CLINIC-0001", async () => {
      const v = await service.record(TENANT_A, validInput(), VET_A);
      await expect(
        service.cancel(TENANT_B, v.id, "x", VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });
});
