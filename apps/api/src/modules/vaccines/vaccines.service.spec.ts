/**
 * @file VaccinesService unit testleri.
 * @module apps/api/modules/vaccines/vaccines.service.spec
 *
 * @description Aşı protokolü oluşturma, tenant izolasyonu, filtreleme
 * (species / category / isCore), güncelleme (türetilmiş alanlar),
 * arşivleme (soft delete) ve audit event yayını. DB migration
 * olmadığı için in-memory repo + mock AuditService kullanılır.
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { VaccinesRepository } from "./vaccines.repository.js";
import { VaccinesService } from "./vaccines.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

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

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function validSteps(): Array<{
  ageWeeks: number;
  vaccineName: string;
  boosterIntervalDays?: number;
  dose?: { amount: number; unit: "ml" | "dose" | "mg" | "drop" };
  notes?: string;
}> {
  return [
    { ageWeeks: 8, vaccineName: "DHPP-1" },
    { ageWeeks: 12, vaccineName: "DHPP-2" },
    { ageWeeks: 16, vaccineName: "DHPP-3" },
  ];
}

function validInput(
  overrides: Partial<{
    name: string;
    species: "dog" | "cat" | "bird" | "all";
    category: "core" | "non_core" | "lifestyle" | "not_recommended";
    manufacturer: string;
    defaultDose: { amount: number; unit: "ml" | "dose" | "mg" | "drop" };
    steps: ReturnType<typeof validSteps>;
  }> = {},
) {
  return {
    name: "Köpek Core Aşı Takvimi",
    species: "dog" as const,
    category: "core" as const,
    manufacturer: "Zoetis",
    steps: validSteps(),
    ...overrides,
  };
}

describe("VaccinesService", () => {
  let service: VaccinesService;
  let repo: VaccinesRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new VaccinesRepository();
    audit = makeAudit();
    service = new VaccinesService(repo, audit);
  });

  // -------------------------------------------------------------------------
  // createProtocol
  // -------------------------------------------------------------------------

  describe("createProtocol", () => {
    it("başarı: totalDurationMonths ve isCore doğru hesaplanır + audit.create", async () => {
      const p = await service.createProtocol(TENANT_A, validInput(), VET_A);
      expect(p.id).toMatch(/^vacp-/);
      expect(p.tenantId).toBe(TENANT_A);
      expect(p.name).toBe("Köpek Core Aşı Takvimi");
      expect(p.species).toBe("dog");
      expect(p.category).toBe("core");
      expect(p.isCore).toBe(true);
      // 16 hafta → ceil(16/4.345) = 4 ay
      expect(p.totalDurationMonths).toBe(4);
      expect(p.steps).toHaveLength(3);
      expect(p.archivedAt).toBeNull();
      expect(p.createdBy).toBe("usr-vet-a");

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.protocol.create",
        "vaccine_protocol",
        p.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          name: "Köpek Core Aşı Takvimi",
          species: "dog",
          category: "core",
          isCore: true,
          stepCount: 3,
        }),
      );
    });

    it("category=non_core → isCore=false", async () => {
      const p = await service.createProtocol(
        TENANT_A,
        validInput({ category: "non_core" }),
        VET_A,
      );
      expect(p.category).toBe("non_core");
      expect(p.isCore).toBe(false);
    });

    it("empty steps → 422 VET-VALIDATION-0010", async () => {
      await expect(
        service.createProtocol(TENANT_A, validInput({ steps: [] }), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0010",
        httpStatus: 422,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("defaultDose verilince response'a yansır", async () => {
      const p = await service.createProtocol(
        TENANT_A,
        validInput({ defaultDose: { amount: 1, unit: "ml" } }),
        VET_A,
      );
      expect(p.defaultDose).toEqual({ amount: 1, unit: "ml" });
    });

    it("defaultDose verilmezse null döner", async () => {
      const p = await service.createProtocol(TENANT_A, validInput(), VET_A);
      expect(p.defaultDose).toBeNull();
    });

    it("step boosterIntervalDays ve dose override saklanır", async () => {
      const p = await service.createProtocol(
        TENANT_A,
        validInput({
          steps: [
            { ageWeeks: 8, vaccineName: "DHPP-1", boosterIntervalDays: 21 },
            {
              ageWeeks: 12,
              vaccineName: "DHPP-2",
              dose: { amount: 1.5, unit: "ml" },
            },
          ],
        }),
        VET_A,
      );
      expect(p.steps[0]?.boosterIntervalDays).toBe(21);
      expect(p.steps[1]?.dose).toEqual({ amount: 1.5, unit: "ml" });
    });
  });

  // -------------------------------------------------------------------------
  // listProtocols
  // -------------------------------------------------------------------------

  describe("listProtocols", () => {
    it("species=dog filtresi", async () => {
      await service.createProtocol(
        TENANT_A,
        validInput({ name: "Köpek core" }),
        VET_A,
      );
      await service.createProtocol(
        TENANT_A,
        validInput({ name: "Kedi core", species: "cat" }),
        VET_A,
      );
      const r = await service.listProtocols(
        TENANT_A,
        { species: "dog", limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(1);
      expect(r.items.every((p) => p.species === "dog")).toBe(true);
    });

    it("isCore=true filtresi", async () => {
      await service.createProtocol(
        TENANT_A,
        validInput({ name: "Core" }),
        VET_A,
      );
      await service.createProtocol(
        TENANT_A,
        validInput({ name: "NonCore", category: "lifestyle" }),
        VET_A,
      );
      const r = await service.listProtocols(
        TENANT_A,
        { isCore: true, limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.isCore).toBe(true);
    });

    it("category=core filtresi", async () => {
      await service.createProtocol(
        TENANT_A,
        validInput({ name: "Core-1" }),
        VET_A,
      );
      await service.createProtocol(
        TENANT_A,
        validInput({ name: "Lifestyle-1", category: "lifestyle" }),
        VET_A,
      );
      const r = await service.listProtocols(
        TENANT_A,
        { category: "core", limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.category).toBe("core");
    });
  });

  // -------------------------------------------------------------------------
  // getProtocol — tenant izolasyonu
  // -------------------------------------------------------------------------

  describe("getProtocol", () => {
    it("cross-tenant → null", async () => {
      const created = await service.createProtocol(
        TENANT_A,
        validInput(),
        VET_A,
      );
      const found = await service.getProtocol(TENANT_B, created.id, VET_B);
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateProtocol
  // -------------------------------------------------------------------------

  describe("updateProtocol", () => {
    it("category değişimi → isCore yeniden türetilir", async () => {
      const created = await service.createProtocol(
        TENANT_A,
        validInput(),
        VET_A,
      );
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const updated = await service.updateProtocol(
        TENANT_A,
        created.id,
        { category: "lifestyle" },
        VET_A,
      );
      expect(updated.category).toBe("lifestyle");
      expect(updated.isCore).toBe(false);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.protocol.update",
        "vaccine_protocol",
        created.id,
        "update",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          // Vitest asymmetric matcher API'si `any` dondurur; assertion
          // sadece append-only oncesi durum snapshot'ini dogrular.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          before: expect.objectContaining({ isCore: true }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          after: expect.objectContaining({ isCore: false }),
        }),
      );
    });

    it("steps değişimi → totalDurationMonths yeniden hesaplanır", async () => {
      const created = await service.createProtocol(
        TENANT_A,
        validInput(),
        VET_A,
      );
      const updated = await service.updateProtocol(
        TENANT_A,
        created.id,
        { steps: [{ ageWeeks: 52, vaccineName: "Annual booster" }] },
        VET_A,
      );
      // 52 hafta → ceil(52/4.345) = 12 ay
      expect(updated.totalDurationMonths).toBe(12);
      expect(updated.steps).toHaveLength(1);
    });

    it("arşivlenmiş protokol → 409 VET-VACC-0001", async () => {
      const created = await service.createProtocol(
        TENANT_A,
        validInput(),
        VET_A,
      );
      await service.archiveProtocol(TENANT_A, created.id, VET_A);
      await expect(
        service.updateProtocol(
          TENANT_A,
          created.id,
          { name: "Yeni isim" },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0001",
        httpStatus: 409,
      });
    });

    it("defaultDose update — set edilince yansır", async () => {
      const created = await service.createProtocol(
        TENANT_A,
        validInput(),
        VET_A,
      );
      const updated = await service.updateProtocol(
        TENANT_A,
        created.id,
        { defaultDose: { amount: 2, unit: "dose" } },
        VET_A,
      );
      expect(updated.defaultDose).toEqual({ amount: 2, unit: "dose" });
    });

    it("defaultDose override — mevcut doz değişir", async () => {
      const created = await service.createProtocol(
        TENANT_A,
        validInput({ defaultDose: { amount: 1, unit: "ml" } }),
        VET_A,
      );
      expect(created.defaultDose).toEqual({ amount: 1, unit: "ml" });
      const updated = await service.updateProtocol(
        TENANT_A,
        created.id,
        { defaultDose: { amount: 0.5, unit: "ml" } },
        VET_A,
      );
      expect(updated.defaultDose).toEqual({ amount: 0.5, unit: "ml" });
    });
  });

  // -------------------------------------------------------------------------
  // archiveProtocol
  // -------------------------------------------------------------------------

  describe("archiveProtocol", () => {
    it("archivedAt set edilir + audit.archive (warning)", async () => {
      const created = await service.createProtocol(
        TENANT_A,
        validInput(),
        VET_A,
      );
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await service.archiveProtocol(TENANT_A, created.id, VET_A);
      const after = await service.getProtocol(TENANT_A, created.id, VET_A);
      expect(after?.archivedAt).toBeTruthy();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.protocol.archive",
        "vaccine_protocol",
        created.id,
        "archive",
        expect.objectContaining({ tenantId: TENANT_A }),
        "warning",
        expect.objectContaining({ name: created.name }),
      );
    });

    it("zaten arşivlenmiş → 409 VET-VACC-0002", async () => {
      const created = await service.createProtocol(
        TENANT_A,
        validInput(),
        VET_A,
      );
      await service.archiveProtocol(TENANT_A, created.id, VET_A);
      await expect(
        service.archiveProtocol(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VACC-0002",
        httpStatus: 409,
      });
    });

    it("cross-tenant archive → 404 VET-CLINIC-0001", async () => {
      const created = await service.createProtocol(
        TENANT_A,
        validInput(),
        VET_A,
      );
      await expect(
        service.archiveProtocol(TENANT_B, created.id, VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });
});
