/**
 * @file OwnershipHistoryService unit testleri.
 * @module apps/api/modules/ownership-history/ownership-history.service.spec
 *
 * @description Tenant izolasyonu, aktif kayıt tek olma invariantı,
 * transfer akışı (kapat + yeni aç), audit event yayını, neden
 * kuralları (initial/other), arşivli hasta reddi ve cross-tenant
 * owner doğrulaması testleri.
 *
 * @since GOAL-022 (FAZ-2) sahiplik geçmişi core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { OwnershipHistoryRepository } from "./ownership-history.repository.js";
import { OwnershipHistoryService } from "./ownership-history.service.js";
import { PatientsRepository } from "../patients/patients.repository.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Owner } from "../../common/owners/owner.types.js";
import type { Ownership } from "../../common/ownership/ownership.types.js";
import type { OwnersService } from "../owners/owners.service.js";
import type { PatientRecord } from "../patients/patients.repository.js";

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

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const OWNER_A2 = "33333333-3333-3333-3333-333333333333";
const OWNER_B = "22222222-2222-2222-2222-222222222222";

/** Owner lookup store. */
const ownersStore = new Map<string, Owner>();
function seedOwner(tenantId: string, id: string, firstName = "Owner"): void {
  const owner: Owner = {
    id,
    tenantId,
    firstName,
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

function seedPatient(
  patients: PatientsRepository,
  tenantId: string,
  id: string,
  ownerId: string,
  archived = false,
): PatientRecord {
  const rec = patients.toRecord(id, tenantId, {
    ownerId,
    name: "Boncuk",
    species: "dog",
    gender: "male",
    neutered: false,
  });
  if (archived) {
    rec.archivedAt = "2025-06-01T00:00:00.000Z";
  }
  patients.insert(rec);
  return rec;
}

describe("OwnershipHistoryService", () => {
  let service: OwnershipHistoryService;
  let repo: OwnershipHistoryRepository;
  let patients: PatientsRepository;
  let owners: OwnersService;
  let audit: AuditService;

  beforeEach(() => {
    ownersStore.clear();
    seedOwner(TENANT_A, OWNER_A, "Ali");
    seedOwner(TENANT_A, OWNER_A2, "Ayşe");
    seedOwner(TENANT_B, OWNER_B, "Bob");
    repo = new OwnershipHistoryRepository();
    patients = new PatientsRepository();
    owners = makeOwners();
    audit = makeAudit();
    service = new OwnershipHistoryService(repo, patients, owners, audit);
  });

  describe("createInitial", () => {
    it("ilk sahiplik kaydını açar (reason=initial, endDate=null)", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-1", OWNER_A);
      const own = await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);
      expect(own.reason).toBe("initial");
      expect(own.endDate).toBeNull();
      expect(own.startDate).toBe(p.createdAt);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:ownership.create",
          targetType: "ownership",
          action: "create",
          severity: "info",
        }),
      );
    });

    it("zaten aktif kayıt varsa → 409 VET-CLINIC-0006", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-2", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);
      await expect(
        service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0006",
        httpStatus: 409,
      });
    });

    it("olmayan hasta → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.createInitial(
          TENANT_A,
          "99999999-9999-9999-9999-999999999999",
          OWNER_A,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });

    it("cross-tenant → 403 VET-AUTHZ-0001", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-3", OWNER_A);
      await expect(
        service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  describe("transfer", () => {
    it("aktif kaydı kapatır + yeni kayıt açar (append-only)", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-10", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);

      const res = await service.transfer(
        TENANT_A,
        p.id,
        { newOwnerId: OWNER_A2, reason: "transfer" },
        STAFF_A,
      );

      expect(res.closed).not.toBeNull();
      expect(res.closed?.ownerId).toBe(OWNER_A);
      expect(res.closed?.endDate).not.toBeNull();
      expect(res.opened.ownerId).toBe(OWNER_A2);
      expect(res.opened.reason).toBe("transfer");
      expect(res.opened.endDate).toBeNull();

      // Patient.ownerId güncellenmiş olmalı.
      const refreshed = patients.findById(TENANT_A, p.id);
      expect(refreshed?.ownerId).toBe(OWNER_A2);

      // Audit eventleri: create + transfer.
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:ownership.transfer",
          targetType: "ownership",
          action: "transfer",
          severity: "warning",
        }),
      );
    });

    it("yeni sahip mevcut sahiple aynı → 422 VET-CLINIC-0007", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-11", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);

      await expect(
        service.transfer(
          TENANT_A,
          p.id,
          { newOwnerId: OWNER_A, reason: "transfer" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0007",
        httpStatus: 422,
      });
    });

    it("yeni sahip farklı tenant'ta → 404 VET-AUTHZ-0002", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-12", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);

      await expect(
        service.transfer(
          TENANT_A,
          p.id,
          { newOwnerId: OWNER_B, reason: "transfer" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0002",
        httpStatus: 404,
      });
    });

    it("reason=initial kabul edilmez → 422 VET-CLINIC-0009", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-13", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);

      await expect(
        service.transfer(
          TENANT_A,
          p.id,
          { newOwnerId: OWNER_A2, reason: "initial" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0009",
        httpStatus: 422,
      });
    });

    it("reason=other ise otherNote zorunlu → 422 VET-VALIDATION-0004", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-14", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);

      await expect(
        service.transfer(
          TENANT_A,
          p.id,
          { newOwnerId: OWNER_A2, reason: "other" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0004",
        httpStatus: 422,
      });
    });

    it("arşivli hasta transfer reddedilir → 422 VET-CLINIC-0008", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-15", OWNER_A, true);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);

      await expect(
        service.transfer(
          TENANT_A,
          p.id,
          { newOwnerId: OWNER_A2, reason: "transfer" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0008",
        httpStatus: 422,
      });
    });

    it("cross-tenant → 403 VET-AUTHZ-0001", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-16", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);
      await expect(
        service.transfer(
          TENANT_A,
          p.id,
          { newOwnerId: OWNER_A2, reason: "transfer" },
          STAFF_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("audit event metadata portal=refresh_required sinyali taşır", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-17", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);
      vi.clearAllMocks();
      await service.transfer(
        TENANT_A,
        p.id,
        { newOwnerId: OWNER_A2, reason: "transfer" },
        STAFF_A,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          // Vitest asymmetric matcher API'si `any` dondurur; burada sadece
          // portal yenileme sinyalinin audit metadata'sinda oldugu sinanir.

          metadata: expect.objectContaining({
            portal: "refresh_required",
          }),
        }),
      );
    });
  });

  describe("list / findActiveByPatient — tenant izolasyonu", () => {
    it("hasta bazlı tüm geçmişi döner (en yeni üstte)", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-20", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);
      await service.transfer(
        TENANT_A,
        p.id,
        { newOwnerId: OWNER_A2, reason: "transfer" },
        STAFF_A,
      );

      const list = await service.list(
        TENANT_A,
        { patientId: p.id, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(2);
      // Aktif kayıt üstte.
      expect(list.items[0]?.endDate).toBeNull();
      expect(list.items[0]?.ownerId).toBe(OWNER_A2);
      expect(list.items[1]?.endDate).not.toBeNull();
      expect(list.items[1]?.ownerId).toBe(OWNER_A);
    });

    it("cross-tenant list → 403", async () => {
      await expect(
        service.list(
          TENANT_A,
          { patientId: "x", limit: 10, offset: 0 },
          STAFF_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("findActiveByPatient doğru aktif kaydı döner", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-21", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);
      await service.transfer(
        TENANT_A,
        p.id,
        { newOwnerId: OWNER_A2, reason: "gift" },
        STAFF_A,
      );

      const active = await service.findActiveByPatient(TENANT_A, p.id, STAFF_A);
      expect(active?.ownerId).toBe(OWNER_A2);
      expect(active?.reason).toBe("gift");
      expect(active?.endDate).toBeNull();
    });

    it("farklı tenant aynı hastaId → null", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-22", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);
      const cross = await service.findActiveByPatient(TENANT_B, p.id, STAFF_B);
      expect(cross).toBeNull();
    });
  });

  describe("invariant: tek aktif kayıt", () => {
    it("ardışık transfer sonrası aktif kayıt sayısı 1 olur", async () => {
      const p = seedPatient(patients, TENANT_A, "pat-30", OWNER_A);
      await service.createInitial(TENANT_A, p.id, OWNER_A, STAFF_A);

      const reasons: Array<Ownership["reason"]> = [
        "transfer",
        "gift",
        "abandonment",
      ];
      let prev: string = OWNER_A;
      for (let i = 0; i < reasons.length; i++) {
        const next = i % 2 === 0 ? OWNER_A2 : OWNER_A;
        await service.transfer(
          TENANT_A,
          p.id,
          { newOwnerId: next, reason: reasons.at(i)! },
          STAFF_A,
        );
        prev = next;
      }

      const list = await service.list(
        TENANT_A,
        { patientId: p.id, limit: 100, offset: 0 },
        STAFF_A,
      );
      const activeCount = list.items.filter((o) => o.endDate === null).length;
      expect(activeCount).toBe(1);
      expect(list.items[0]?.ownerId).toBe(prev);
    });
  });
});
