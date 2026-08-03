/**
 * @file PatientsService unit testleri.
 * @module apps/api/modules/patients/patients.service.spec
 *
 * @description Owner doğrulama (cross-tenant), tür whitelist,
 * mikroçip unique + format, doğum tarihi geçmiş kontrolü,
 * tenant izolasyonu, arama, arşivleme ve audit event yayını.
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { PatientsRepository } from "./patients.repository.js";
import { PatientsService } from "./patients.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Owner } from "../../common/owners/owner.types.js";
import type { Ownership } from "../../common/ownership/ownership.types.js";
import type { AlertsService } from "../alerts/alerts.service.js";
import type { OwnersService } from "../owners/owners.service.js";
import type { OwnershipHistoryService } from "../ownership-history/ownership-history.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_B: ActorContext = {
  actorId: "usr-staff-b",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const OWNER_ID_A = "11111111-1111-1111-1111-111111111111";
const OWNER_ID_B = "22222222-2222-2222-2222-222222222222";

/** Mock owner store: key = tenantId|ownerId → Owner. */
const ownersStore = new Map<string, Owner>();

function seedOwner(tenantId: string, id: string): void {
  const owner: Owner = {
    id,
    tenantId,
    firstName: "Owner",
    lastName: "Test",
    phone: "+905320000000",
    email: null,
    taxId: null,
    address: null,
    consents: { kvkk: true, marketing: false },
    createdAt: "2025-01-01T00:00:00.000Z",
    archivedAt: null,
  };
  ownersStore.set(`${tenantId}|${id}`, owner);
}

function makeOwners(): OwnersService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          ownersStore.get(`${tenantId}|${id}`) ?? null,
      ),
  } as unknown as OwnersService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

/** GOAL-023: AlertsService mock (forwardRef inject). */
function makeAlerts(): AlertsService {
  return {
    getActiveAlertsForPatient: vi.fn().mockResolvedValue([]),
  } as unknown as AlertsService;
}

/**
 * GOAL-022: Patient oluşturma sırasında ilk sahiplik kaydı
 * otomatik açılır. Testlerde bunu minimal mock ile sağlıyoruz.
 */
function makeOwnership(): OwnershipHistoryService {
  const stub: Partial<OwnershipHistoryService> = {
    createInitial: vi.fn(
      async (
        tenantId: string,
        patientId: string,
        ownerId: string,
      ): Promise<Ownership> => ({
        id: `own-stub-${patientId.slice(-4)}`,
        tenantId,
        patientId,
        ownerId,
        startDate: new Date().toISOString(),
        endDate: null,
        reason: "initial",
        otherNote: null,
        createdBy: "usr-staff-a",
        createdAt: new Date().toISOString(),
      }),
    ),
    transfer: vi.fn(),
    list: vi.fn(),
    findActiveByPatient: vi.fn(),
  };
  return stub as OwnershipHistoryService;
}

function validInput(
  overrides: Partial<{
    ownerId: string;
    name: string;
    species: "dog" | "cat" | "bird" | "other";
    breed: string;
    birthDate: string;
    gender: "male" | "female" | "unknown";
    microchip: string;
    color: string;
    neutered: boolean;
    notes: string;
  }> = {},
) {
  return {
    ownerId: OWNER_ID_A,
    name: "Boncuk",
    species: "dog" as const,
    gender: "male" as const,
    neutered: false,
    ...overrides,
  };
}

describe("PatientsService", () => {
  let service: PatientsService;
  let repo: PatientsRepository;
  let owners: OwnersService;
  let audit: AuditService;
  let ownership: OwnershipHistoryService;

  beforeEach(() => {
    ownersStore.clear();
    seedOwner(TENANT_A, OWNER_ID_A);
    seedOwner(TENANT_B, OWNER_ID_B);
    repo = new PatientsRepository();
    owners = makeOwners();
    audit = makeAudit();
    ownership = makeOwnership();
    const alerts = makeAlerts();
    service = new PatientsService(owners, repo, audit, ownership, alerts);
  });

  describe("create — başarı", () => {
    it("hasta oluşturur, audit:patient.create (info) yayınlanır", async () => {
      const patient = await service.create(
        TENANT_A,
        validInput({ microchip: "123456789012345" }),
        STAFF_A,
      );

      expect(patient.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(patient.tenantId).toBe(TENANT_A);
      expect(patient.ownerId).toBe(OWNER_ID_A);
      expect(patient.name).toBe("Boncuk");
      expect(patient.species).toBe("dog");
      expect(patient.microchip).toBe("123456789012345");
      expect(patient.archivedAt).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:patient.create",
          targetType: "patient",
          action: "create",
          severity: "info",
        }),
      );
    });

    it("mikroçipsiz ve breedsiz oluşturma", async () => {
      const patient = await service.create(TENANT_A, validInput(), STAFF_A);
      expect(patient.microchip).toBeNull();
      expect(patient.breed).toBeNull();
      expect(patient.birthDate).toBeNull();
    });

    it("GOAL-022: hasta oluşturma sırasında ilk sahiplik kaydı açılır", async () => {
      const patient = await service.create(
        TENANT_A,
        validInput({ name: "Karabaş" }),
        STAFF_A,
      );
      expect(ownership.createInitial).toHaveBeenCalledWith(
        TENANT_A,
        patient.id,
        OWNER_ID_A,
        STAFF_A,
      );
    });
  });

  describe("create — owner doğrulama", () => {
    it("cross-tenant owner → 404 VET-AUTHZ-0002", async () => {
      // STAFF_A, TENANT_A'da OWNER_ID_B (Tenant B) ile denerse → 404.
      await expect(
        service.create(TENANT_A, validInput({ ownerId: OWNER_ID_B }), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0002",
        httpStatus: 404,
      });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("olmayan owner → 404 VET-AUTHZ-0002", async () => {
      await expect(
        service.create(
          TENANT_A,
          validInput({ ownerId: "99999999-9999-9999-9999-999999999999" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0002",
        httpStatus: 404,
      });
    });
  });

  describe("create — tür whitelist (TR pilot)", () => {
    it("other tür → 422 VET-CLINIC-0004", async () => {
      await expect(
        service.create(TENANT_A, validInput({ species: "other" }), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0004",
        httpStatus: 422,
      });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("create — mikroçip", () => {
    it("duplicate mikroçip aynı tenant'ta → 409 VET-CLINIC-0003", async () => {
      await service.create(
        TENANT_A,
        validInput({ microchip: "900000000000001" }),
        STAFF_A,
      );
      await expect(
        service.create(
          TENANT_A,
          validInput({
            name: "Pamuk",
            microchip: "900000000000001",
          }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0003",
        httpStatus: 409,
      });
    });

    it("farklı tenant aynı mikroçip → çakışma yok (tenant-scoped)", async () => {
      await service.create(
        TENANT_A,
        validInput({ microchip: "900000000000002" }),
        STAFF_A,
      );
      const p = await service.create(
        TENANT_B,
        validInput({ ownerId: OWNER_ID_B, microchip: "900000000000002" }),
        STAFF_B,
      );
      expect(p.tenantId).toBe(TENANT_B);
      expect(p.microchip).toBe("900000000000002");
    });
  });

  describe("create — doğum tarihi", () => {
    it("gelecekteki tarih → 422 VET-VALIDATION-0009", async () => {
      const future = "2999-12-31";
      await expect(
        service.create(TENANT_A, validInput({ birthDate: future }), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0009",
        httpStatus: 422,
      });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("findById — tenant izolasyonu", () => {
    it("kendi tenant'ından okur", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      const found = await service.findById(TENANT_A, created.id, STAFF_A);
      expect(found?.id).toBe(created.id);
    });

    it("cross-tenant → null (controller 404)", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      const found = await service.findById(TENANT_B, created.id, STAFF_B);
      expect(found).toBeNull();
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await service.create(
        TENANT_A,
        validInput({ name: "Boncuk", microchip: "900000000000010" }),
        STAFF_A,
      );
      await service.create(
        TENANT_A,
        validInput({
          name: "Pamuk",
          breed: "Tekir",
          microchip: "900000000000011",
        }),
        STAFF_A,
      );
      await service.create(
        TENANT_B,
        validInput({ ownerId: OWNER_ID_B, name: "Boncuk" }),
        STAFF_B,
      );
    });

    it("ad ile arama (case-insensitive)", async () => {
      const r = await service.search(
        TENANT_A,
        { search: "boncuk", limit: 20, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.name).toBe("Boncuk");
    });

    it("mikroçip ile arama", async () => {
      const r = await service.search(
        TENANT_A,
        { search: "900000000000011", limit: 20, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.name).toBe("Pamuk");
    });

    it("ownerId filtresi", async () => {
      const r = await service.search(
        TENANT_A,
        { ownerId: OWNER_ID_A, limit: 20, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(2);
      expect(r.items.every((p) => p.ownerId === OWNER_ID_A)).toBe(true);
    });

    it("tenant izolasyonu: başka tenant kayıtları görünmez", async () => {
      const r = await service.search(
        TENANT_A,
        { search: "Boncuk", limit: 20, offset: 0 },
        STAFF_A,
      );
      // Tenant A'da yalnızca 1 Boncuk var.
      expect(r.total).toBe(1);
      expect(r.items[0]?.tenantId).toBe(TENANT_A);
    });
  });

  describe("archive", () => {
    it("archivedAt set edilir, audit:patient.archive (warning) yayınlanır", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      const archived = await service.archive(TENANT_A, created.id, STAFF_A);
      expect(archived.archivedAt).not.toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:patient.archive",
          targetType: "patient",
          action: "archive",
          severity: "warning",
        }),
      );
    });

    it("ikinci kez arşivleme idempotent", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      const first = await service.archive(TENANT_A, created.id, STAFF_A);
      const second = await service.archive(TENANT_A, created.id, STAFF_A);
      expect(second.archivedAt).toBe(first.archivedAt);
    });

    it("olmayan id → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.archive(
          TENANT_A,
          "00000000-0000-0000-0000-000000000000",
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });
});
