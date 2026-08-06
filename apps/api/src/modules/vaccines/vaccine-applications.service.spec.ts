/**
 * @file VaccineApplicationsService unit testleri.
 * @module apps/api/modules/vaccines/vaccine-applications.service.spec
 *
 * @description Aşı uygulama kaydı oluşturma (atomik stok düşümü),
 * tenant izolasyonu, protokol/patient doğrulaması, SKT ve stok
 * kontrolü, düzeltme (amend), iptal (cancel) + ters kayıt ve
 * audit event yayını. DB migration olmadığı için in-memory
 * repo + ledger + mock VaccinesService + mock PatientsService +
 * mock AuditService kullanılır.
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { VaccineApplicationsRepository } from "./vaccine-applications.repository.js";
import { VaccineApplicationsService } from "./vaccine-applications.service.js";
import { VaccineStockLedger } from "../../common/vaccines/vaccine-stock-ledger.js";

import type { VaccinesService } from "./vaccines.service.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Patient } from "../../common/patients/patient.types.js";
import type { PatientsService } from "../patients/patients.service.js";
import type { VaccineProtocol } from "@vetniva/contracts";

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

const SUPERADMIN: ActorContext = {
  actorId: "usr-super",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: null,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-3",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

/** Mock patient store. */
const patientsStore = new Map<string, Patient>();
function seedPatient(
  tenantId: string,
  id: string,
  species: Patient["species"],
): void {
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
    lot: { lot: string; expiryDate: string; stockProductId: string };
    dose: { amount: number; unit: "ml" | "dose" | "mg" | "drop" };
    administeredBy: string;
    applicationDate: string;
    nextDueDate: string;
    notes: string;
  }> = {},
) {
  return {
    patientId: "pat-dog-1",
    protocolId: "vacp-test-1",
    lot: {
      lot: "LOT-2026-A",
      expiryDate: "2027-12-31",
      stockProductId: "stkp-vac-1",
    },
    applicationDate: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("VaccineApplicationsService", () => {
  let service: VaccineApplicationsService;
  let repo: VaccineApplicationsRepository;
  let stock: VaccineStockLedger;
  let vaccines: VaccinesService;
  let patients: PatientsService;
  let audit: AuditService;

  beforeEach(() => {
    repo = new VaccineApplicationsRepository();
    stock = new VaccineStockLedger();
    vaccines = makeVaccines();
    patients = makePatients();
    audit = makeAudit();

    service = new VaccineApplicationsService(
      repo,
      stock,
      vaccines,
      patients,
      audit,
    );

    patientsStore.clear();
    protocolsStore.clear();

    // Varsayılan seed: dog patient + dog protocol + 5 stok
    seedPatient(TENANT_A, "pat-dog-1", "dog");
    seedPatient(TENANT_A, "pat-cat-1", "cat");
    seedProtocol(validProtocol());
    stock.addStock({
      tenantId: TENANT_A,
      stockProductId: "stkp-vac-1",
      lot: "LOT-2026-A",
      expiryDate: "2027-12-31",
      quantity: 5,
    });
  });

  // -------------------------------------------------------------------------
  // createApplication
  // -------------------------------------------------------------------------

  describe("createApplication", () => {
    it("başarı: kayıt oluşur + stok 1 düşer + audit.create (info)", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      expect(a.id).toMatch(/^vaca-/);
      expect(a.patientId).toBe("pat-dog-1");
      expect(a.protocolId).toBe("vacp-test-1");
      expect(a.status).toBe("active");
      expect(a.dose).toEqual({ amount: 1, unit: "ml" });
      expect(a.administeredBy).toBe("usr-vet-a");
      expect(a.stockMovementIds).toHaveLength(1);

      // Stok 5 → 4
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(4);

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.application.create",
        "vaccine_application",
        a.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          patientId: "pat-dog-1",
          protocolId: "vacp-test-1",
          lot: "LOT-2026-A",
        }),
      );
    });

    it("client dose override edilirse protokolden bağımsız kullanılır", async () => {
      const a = await service.createApplication(
        TENANT_A,
        validInput({ dose: { amount: 2, unit: "dose" } }),
        VET_A,
      );
      expect(a.dose).toEqual({ amount: 2, unit: "dose" });
    });

    it("protocol defaultDose yoksa ve client vermezse dose=null", async () => {
      seedProtocol(
        validProtocol({
          id: "vacp-test-2",
          defaultDose: null,
        }),
      );
      stock.addStock({
        tenantId: TENANT_A,
        stockProductId: "stkp-vac-2",
        lot: "LOT-2026-B",
        expiryDate: "2027-12-31",
        quantity: 3,
      });
      const a = await service.createApplication(
        TENANT_A,
        validInput({
          protocolId: "vacp-test-2",
          lot: {
            lot: "LOT-2026-B",
            expiryDate: "2027-12-31",
            stockProductId: "stkp-vac-2",
          },
        }),
        VET_A,
      );
      expect(a.dose).toBeNull();
    });

    it("patient cross-tenant → 404 VET-CLINIC-0001", async () => {
      // TENANT_B user, ama patientId TENANT_A'da
      await expect(
        service.createApplication(TENANT_B, validInput(), VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      // Stok değişmemeli.
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(5);
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("protocol cross-tenant → 404 VET-VACC-0004", async () => {
      // patient TENANT_B'de (validation geçer), protocol yalnızca
      // TENANT_A'da → protocol cross-tenant 404.
      seedPatient(TENANT_B, "pat-dog-b", "dog");
      stock.addStock({
        tenantId: TENANT_B,
        stockProductId: "stkp-vac-1",
        lot: "LOT-2026-A",
        expiryDate: "2027-12-31",
        quantity: 1,
      });
      await expect(
        service.createApplication(
          TENANT_B,
          validInput({ patientId: "pat-dog-b" }),
          VET_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0004",
        httpStatus: 404,
      });
    });

    it("arşivlenmiş protocol → 409 VET-VACC-0005", async () => {
      seedProtocol(
        validProtocol({
          id: "vacp-archived",
          archivedAt: "2025-06-01T00:00:00.000Z",
        }),
      );
      await expect(
        service.createApplication(
          TENANT_A,
          validInput({ protocolId: "vacp-archived" }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0005",
        httpStatus: 409,
      });
    });

    it("protocol species != patient species → 422 VET-VACC-0006", async () => {
      await expect(
        service.createApplication(
          TENANT_A,
          validInput({ patientId: "pat-cat-1" }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0006",
        httpStatus: 422,
      });
    });

    it("protocol species='all' her türe uygulanabilir", async () => {
      seedProtocol(validProtocol({ id: "vacp-univ", species: "all" }));
      const a = await service.createApplication(
        TENANT_A,
        validInput({ patientId: "pat-cat-1", protocolId: "vacp-univ" }),
        VET_A,
      );
      expect(a.protocolId).toBe("vacp-univ");
    });

    it("SKT geçmiş lot → 422 VET-VACC-0002", async () => {
      await expect(
        service.createApplication(
          TENANT_A,
          validInput({
            lot: {
              lot: "LOT-OLD",
              expiryDate: "2024-01-01",
              stockProductId: "stkp-vac-1",
            },
          }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0002",
        httpStatus: 422,
      });
    });

    it("yetersiz stok → 422 VET-VACC-0003", async () => {
      stock.clear();
      stock.addStock({
        tenantId: TENANT_A,
        stockProductId: "stkp-vac-1",
        lot: "LOT-2026-A",
        expiryDate: "2027-12-31",
        quantity: 0,
      });
      await expect(
        service.createApplication(TENANT_A, validInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0003",
        httpStatus: 422,
      });
    });

    it("yetersiz stok → kayıt oluşmamalı (atomik)", async () => {
      stock.clear();
      stock.addStock({
        tenantId: TENANT_A,
        stockProductId: "stkp-vac-1",
        lot: "LOT-2026-A",
        expiryDate: "2027-12-31",
        quantity: 0,
      });
      await expect(
        service.createApplication(TENANT_A, validInput(), VET_A),
      ).rejects.toBeDefined();
      // Hiç kayıt olmamalı.
      const list = await service.listApplications(
        TENANT_A,
        { limit: 20, offset: 0 },
        VET_A,
      );
      expect(list.total).toBe(0);
    });

    it("administeredBy belirtilmezse actor.actorId kullanılır", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      expect(a.administeredBy).toBe("usr-vet-a");
    });
  });

  // -------------------------------------------------------------------------
  // listApplications
  // -------------------------------------------------------------------------

  describe("listApplications", () => {
    it("patientId filtresi", async () => {
      await service.createApplication(TENANT_A, validInput(), VET_A);
      seedProtocol(
        validProtocol({
          id: "vacp-cat",
          species: "cat",
        }),
      );
      stock.addStock({
        tenantId: TENANT_A,
        stockProductId: "stkp-vac-1",
        lot: "LOT-2026-C",
        expiryDate: "2027-12-31",
        quantity: 2,
      });
      await service.createApplication(
        TENANT_A,
        validInput({
          patientId: "pat-cat-1",
          protocolId: "vacp-cat",
          lot: {
            lot: "LOT-2026-C",
            expiryDate: "2027-12-31",
            stockProductId: "stkp-vac-1",
          },
        }),
        VET_A,
      );
      const r = await service.listApplications(
        TENANT_A,
        { patientId: "pat-dog-1", limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.patientId).toBe("pat-dog-1");
    });

    it("cancelled default hariç; status=cancelled ile dahil", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      await service.cancelApplication(
        TENANT_A,
        a.id,
        { reason: "test" },
        VET_A,
      );
      const r1 = await service.listApplications(
        TENANT_A,
        { limit: 20, offset: 0 },
        VET_A,
      );
      expect(r1.total).toBe(0);
      const r2 = await service.listApplications(
        TENANT_A,
        { status: "cancelled", limit: 20, offset: 0 },
        VET_A,
      );
      expect(r2.total).toBe(1);
    });

    it("cross-tenant → boş liste", async () => {
      await service.createApplication(TENANT_A, validInput(), VET_A);
      const r = await service.listApplications(
        TENANT_B,
        { limit: 20, offset: 0 },
        VET_B,
      );
      expect(r.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getApplication
  // -------------------------------------------------------------------------

  describe("getApplication", () => {
    it("cross-tenant → null", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      const found = await service.getApplication(TENANT_B, a.id, VET_B);
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // listByPatient
  // -------------------------------------------------------------------------

  describe("listByPatient", () => {
    it("en yeni kayıt üstte", async () => {
      await service.createApplication(
        TENANT_A,
        validInput({ applicationDate: "2026-01-10T10:00:00.000Z" }),
        VET_A,
      );
      await service.createApplication(
        TENANT_A,
        validInput({ applicationDate: "2026-02-10T10:00:00.000Z" }),
        VET_A,
      );
      const list = await service.listByPatient(TENANT_A, "pat-dog-1", VET_A);
      expect(list).toHaveLength(2);
      const a0 = list[0];
      const a1 = list[1];
      expect(a0).toBeDefined();
      expect(a1).toBeDefined();
      if (a0 && a1) {
        expect(a0.applicationDate > a1.applicationDate).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // amendApplication
  // -------------------------------------------------------------------------

  describe("amendApplication", () => {
    it("active → amended, doz + sonraki tarih güncellenir", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const amended = await service.amendApplication(
        TENANT_A,
        a.id,
        {
          dose: { amount: 1.5, unit: "ml" },
          nextDueDate: "2027-02-15",
          reason: "Doz yanlış girilmişti",
        },
        VET_A,
      );
      expect(amended.status).toBe("amended");
      expect(amended.dose).toEqual({ amount: 1.5, unit: "ml" });
      expect(amended.nextDueDate).toBe("2027-02-15");
      expect(amended.amendedAt).toBeTruthy();
      expect(amended.amendedBy).toBe("usr-vet-a");

      // Stok değişmemeli.
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(4);

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.application.amend",
        "vaccine_application",
        a.id,
        "amend",
        expect.objectContaining({ tenantId: TENANT_A }),
        "warning",
        expect.objectContaining({ reason: "Doz yanlış girilmişti" }),
      );
    });

    it("cancelled kayıt amend edilemez → 409 VET-VACC-0007", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      await service.cancelApplication(
        TENANT_A,
        a.id,
        { reason: "iptal" },
        VET_A,
      );
      await expect(
        service.amendApplication(TENANT_A, a.id, { reason: "tekrar" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0007",
        httpStatus: 409,
      });
    });

    it("zaten amended kayıt → 409 VET-VACC-0007", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      await service.amendApplication(
        TENANT_A,
        a.id,
        { reason: "first" },
        VET_A,
      );
      await expect(
        service.amendApplication(TENANT_A, a.id, { reason: "second" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0007",
        httpStatus: 409,
      });
    });

    it("cross-tenant → 404 VET-CLINIC-0001", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      await expect(
        service.amendApplication(TENANT_B, a.id, { reason: "x" }, VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });

  // -------------------------------------------------------------------------
  // cancelApplication
  // -------------------------------------------------------------------------

  describe("cancelApplication", () => {
    it("stok ters kayıt ile geri gelir + audit.cancel (warning)", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(4);

      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const cancelled = await service.cancelApplication(
        TENANT_A,
        a.id,
        { reason: "Yanlış hayvana uygulandı" },
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelledAt).toBeTruthy();
      expect(cancelled.cancellationReason).toBe("Yanlış hayvana uygulandı");
      expect(cancelled.stockMovementIds.length).toBe(2); // original + reverse

      // Stok 4 → 5 (geri alındı)
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(5);

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.application.cancel",
        "vaccine_application",
        a.id,
        "cancel",
        expect.objectContaining({ tenantId: TENANT_A }),
        "warning",
        expect.objectContaining({
          reason: "Yanlış hayvana uygulandı",

          reversedStockMovementIds: expect.any(Array),
        }),
      );
    });

    it("zaten cancelled → 409 VET-VACC-0008", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      await service.cancelApplication(
        TENANT_A,
        a.id,
        { reason: "iptal" },
        VET_A,
      );
      await expect(
        service.cancelApplication(TENANT_A, a.id, { reason: "tekrar" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0008",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // SUPERADMIN tenant-scope bypass
  // -------------------------------------------------------------------------

  describe("superadmin", () => {
    it("superadmin tenantId olmadan da erişebilir", async () => {
      const a = await service.createApplication(
        TENANT_A,
        validInput(),
        SUPERADMIN,
      );
      expect(a.tenantId).toBe(TENANT_A);
    });
  });

  // -------------------------------------------------------------------------
  // GOAL-054 — Amendment: lot değişikliği (atomik stok ters+yeni)
  // -------------------------------------------------------------------------

  describe("amendApplication — lot değişikliği (GOAL-054)", () => {
    it("lot değişirse eski lot'a iade + yeni lot'tan düşüm + audit lotChange", async () => {
      // İkinci lot için stok seed.
      stock.addStock({
        tenantId: TENANT_A,
        stockProductId: "stkp-vac-1",
        lot: "LOT-2026-B",
        expiryDate: "2027-12-31",
        quantity: 3,
      });

      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      // Başlangıç durumu: LOT-2026-A → 4, LOT-2026-B → 3.
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(4);
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-B",
          expiryDate: "2027-12-31",
        }),
      ).toBe(3);

      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const amended = await service.amendApplication(
        TENANT_A,
        a.id,
        {
          reason: "Yanlış lot girilmişti, doğrusu LOT-2026-B",
          lot: {
            lot: "LOT-2026-B",
            expiryDate: "2027-12-31",
            stockProductId: "stkp-vac-1",
          },
        },
        VET_A,
      );

      // status='amended', yeni lot set edildi.
      expect(amended.status).toBe("amended");
      expect(amended.lot.lot).toBe("LOT-2026-B");
      expect(amended.amendedReason).toBe(
        "Yanlış lot girilmişti, doğrusu LOT-2026-B",
      );

      // Stok: LOT-2026-A 4 → 5 (ters kayıt iade), LOT-2026-B 3 → 2.
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(5);
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-B",
          expiryDate: "2027-12-31",
        }),
      ).toBe(2);

      // stockMovementIds: original + reverse + new decrement.
      expect(amended.stockMovementIds).toHaveLength(3);

      // Audit: lotChange içermeli.
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.application.amend",
        "vaccine_application",
        a.id,
        "amend",
        expect.objectContaining({ tenantId: TENANT_A }),
        "warning",
        expect.objectContaining({
          reason: "Yanlış lot girilmişti, doğrusu LOT-2026-B",

          lotChange: expect.objectContaining({
            before: expect.objectContaining({ lot: "LOT-2026-A" }),

            after: expect.objectContaining({ lot: "LOT-2026-B" }),
          }),
        }),
      );
    });

    it("yeni lot SKT geçmişse → 422 VET-VACC-0010, eski lot değişmez", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      // Eski lot 4, hareket 1 adet.
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(4);
      const oldMovementCount = a.stockMovementIds.length;

      await expect(
        service.amendApplication(
          TENANT_A,
          a.id,
          {
            reason: "lot değişti ama SKT geçmiş",
            lot: {
              lot: "LOT-2026-EXPIRED",
              expiryDate: "2024-01-01",
              stockProductId: "stkp-vac-1",
            },
          },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0010",
        httpStatus: 422,
      });

      // Eski lot değişmemiş olmalı (atomik).
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(4);
      // Record hala aktif, lot değişmemiş.
      const after = await service.getApplication(TENANT_A, a.id, VET_A);
      expect(after?.status).toBe("active");
      expect(after?.lot.lot).toBe("LOT-2026-A");
      expect(after?.stockMovementIds).toHaveLength(oldMovementCount);
    });

    it("yeni lot yetersiz stok → 422 VET-VACC-0009, eski lot değişmez", async () => {
      // Yeni lot 0 stok.
      stock.addStock({
        tenantId: TENANT_A,
        stockProductId: "stkp-vac-1",
        lot: "LOT-2026-C",
        expiryDate: "2027-12-31",
        quantity: 0,
      });
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(4);
      const oldMovementCount = a.stockMovementIds.length;

      await expect(
        service.amendApplication(
          TENANT_A,
          a.id,
          {
            reason: "lot değişti ama stok yok",
            lot: {
              lot: "LOT-2026-C",
              expiryDate: "2027-12-31",
              stockProductId: "stkp-vac-1",
            },
          },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0009",
        httpStatus: 422,
      });

      // Eski lot değişmemiş olmalı (atomik).
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(4);
      // Yeni lot da değişmemiş (decrement denemesi başarısız).
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-C",
          expiryDate: "2027-12-31",
        }),
      ).toBe(0);
      const after = await service.getApplication(TENANT_A, a.id, VET_A);
      expect(after?.status).toBe("active");
      expect(after?.lot.lot).toBe("LOT-2026-A");
      expect(after?.stockMovementIds).toHaveLength(oldMovementCount);
    });

    it("aynı lot bilgisi gönderilirse stok hareketi oluşmaz, sadece alanlar güncellenir", async () => {
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      const oldMovementCount = a.stockMovementIds.length;

      const amended = await service.amendApplication(
        TENANT_A,
        a.id,
        {
          reason: "lot aynı kalsın, sadece not düzelteyim",
          notes: "Yeni not",
          lot: {
            lot: "LOT-2026-A",
            expiryDate: "2027-12-31",
            stockProductId: "stkp-vac-1",
          },
        },
        VET_A,
      );
      expect(amended.status).toBe("amended");
      expect(amended.notes).toBe("Yeni not");
      // Stok değişmemeli.
      expect(
        service.getStockBalance({
          tenantId: TENANT_A,
          stockProductId: "stkp-vac-1",
          lot: "LOT-2026-A",
          expiryDate: "2027-12-31",
        }),
      ).toBe(4);
      expect(amended.stockMovementIds).toHaveLength(oldMovementCount);
    });

    it("lot + dose + notes birlikte değişebilir, audit detail hepsini içerir", async () => {
      stock.addStock({
        tenantId: TENANT_A,
        stockProductId: "stkp-vac-1",
        lot: "LOT-2026-D",
        expiryDate: "2027-12-31",
        quantity: 2,
      });
      const a = await service.createApplication(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      const amended = await service.amendApplication(
        TENANT_A,
        a.id,
        {
          reason: "lot yanlıştı, doz da eksikti",
          dose: { amount: 0.5, unit: "ml" },
          notes: "Doğru doz: 0.5ml",
          nextDueDate: "2027-03-15",
          lot: {
            lot: "LOT-2026-D",
            expiryDate: "2027-12-31",
            stockProductId: "stkp-vac-1",
          },
        },
        VET_A,
      );
      expect(amended.dose).toEqual({ amount: 0.5, unit: "ml" });
      expect(amended.notes).toBe("Doğru doz: 0.5ml");
      expect(amended.nextDueDate).toBe("2027-03-15");
      expect(amended.lot.lot).toBe("LOT-2026-D");

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.application.amend",
        "vaccine_application",
        a.id,
        "amend",
        expect.objectContaining({ tenantId: TENANT_A }),
        "warning",
        expect.objectContaining({
          reason: "lot yanlıştı, doz da eksikti",

          before: expect.objectContaining({
            dose: { amount: 1, unit: "ml" },
          }),

          after: expect.objectContaining({
            dose: { amount: 0.5, unit: "ml" },
          }),

          lotChange: expect.objectContaining({
            before: expect.objectContaining({ lot: "LOT-2026-A" }),

            after: expect.objectContaining({ lot: "LOT-2026-D" }),
          }),
        }),
      );
    });
  });
});
