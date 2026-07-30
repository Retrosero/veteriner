/**
 * @file PortalService unit testleri.
 * @module apps/api/modules/portal/portal.service.spec
 *
 * @description Tenant izolasyonu, owner/patient cross-tenant
 * doğrulama, expiresInDays sınırı, token üretimi, kabul
 * akışının tüm durumları (success/already accepted/expired/
 * revoked/invalid), revoke idempotency, audit event yayını.
 *
 * @since GOAL-025 (FAZ-2) portal erişim daveti
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Owner } from "../../common/owners/owner.types.js";
import type { Patient } from "../../common/patients/patient.types.js";
import type { OwnersService } from "../owners/owners.service.js";
import type { PatientsService } from "../patients/patients.service.js";

import { PortalService } from "./portal.service.js";
import { PortalRepository } from "./portal.repository.js";

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
const PATIENT_ID_A = "33333333-3333-3333-3333-333333333333";
const PATIENT_ID_B = "44444444-4444-4444-4444-444444444444";

/** Mock owner store: key = tenantId|ownerId → Owner. */
const ownersStore = new Map<string, Owner>();
/** Mock patient store: key = tenantId|patientId → Patient. */
const patientsStore = new Map<string, Patient>();

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

function seedPatient(tenantId: string, id: string, ownerId: string): void {
  const patient: Patient = {
    id,
    tenantId,
    ownerId,
    name: "Boncuk",
    species: "dog",
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
  patientsStore.set(`${tenantId}|${id}`, patient);
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

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

describe("PortalService", () => {
  let service: PortalService;
  let repo: PortalRepository;
  let owners: OwnersService;
  let patients: PatientsService;
  let audit: AuditService;

  beforeEach(() => {
    ownersStore.clear();
    patientsStore.clear();
    seedOwner(TENANT_A, OWNER_ID_A);
    seedOwner(TENANT_B, OWNER_ID_B);
    seedPatient(TENANT_A, PATIENT_ID_A, OWNER_ID_A);
    seedPatient(TENANT_B, PATIENT_ID_B, OWNER_ID_B);
    repo = new PortalRepository();
    owners = makeOwners();
    patients = makePatients();
    audit = makeAudit();
    service = new PortalService(repo, owners, patients, audit);
    (audit.record as ReturnType<typeof vi.fn>).mockClear();
  });

  describe("invite — başarı", () => {
    it("davet oluşturur, token üretir, expiresAt set edilir, audit (info) yayınlanır", async () => {
      const inv = await service.invite(
        TENANT_A,
        {
          ownerId: OWNER_ID_A,
          email: "  Test@Example.COM  ",
          patientIds: [PATIENT_ID_A],
          expiresInDays: 7,
          locale: "tr-TR",
        },
        STAFF_A,
      );

      expect(inv.id).toMatch(/^pinv-/);
      expect(inv.tenantId).toBe(TENANT_A);
      expect(inv.email).toBe("test@example.com");
      expect(inv.status).toBe("pending");
      expect(inv.invitationToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(new Date(inv.expiresAt).getTime()).toBeGreaterThan(
        new Date(inv.invitedAt).getTime() + 6 * 24 * 60 * 60 * 1000,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:portal.invite.create",
          targetType: "portal_invitation",
          action: "invite",
          severity: "info",
        }),
      );
    });
  });

  describe("invite — cross-tenant doğrulama", () => {
    it("cross-tenant owner → 404 VET-AUTHZ-0002", async () => {
      await expect(
        service.invite(
          TENANT_A,
          {
            ownerId: OWNER_ID_B, // B tenant'ında
            email: "x@y.com",
            patientIds: [PATIENT_ID_A],
            expiresInDays: 7,
            locale: "tr-TR",
          },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0002",
        httpStatus: 404,
      });
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("cross-tenant patient → 404 VET-AUTHZ-0002", async () => {
      await expect(
        service.invite(
          TENANT_A,
          {
            ownerId: OWNER_ID_A,
            email: "x@y.com",
            patientIds: [PATIENT_ID_B], // B tenant'ında
            expiresInDays: 7,
            locale: "tr-TR",
          },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0002",
        httpStatus: 404,
      });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("invite — validation", () => {
    it("expiresInDays > 30 → 422 VET-VALIDATION-0003", async () => {
      await expect(
        service.invite(
          TENANT_A,
          {
            ownerId: OWNER_ID_A,
            email: "x@y.com",
            patientIds: [PATIENT_ID_A],
            expiresInDays: 60,
            locale: "tr-TR",
          },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0003",
        httpStatus: 422,
      });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("acceptInvitation", () => {
    it("success: pending → accepted, PortalUser oluşturulur, audit (info) yayınlanır", async () => {
      const inv = await service.invite(
        TENANT_A,
        {
          ownerId: OWNER_ID_A,
          email: "x@y.com",
          patientIds: [PATIENT_ID_A],
          expiresInDays: 7,
          locale: "tr-TR",
        },
        STAFF_A,
      );
      (audit.record as ReturnType<typeof vi.fn>).mockClear();

      const result = await service.acceptInvitation({ token: inv.invitationToken });

      expect(result.portalUserId).toMatch(/^pusr-/);
      expect(result.sessionToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      // Repository: status accepted.
      const updated = repo.findById(TENANT_A, inv.id);
      expect(updated?.status).toBe("accepted");
      expect(updated?.acceptedAt).not.toBeNull();

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:portal.invite.accept",
          targetType: "portal_invitation",
          action: "complete",
          severity: "info",
        }),
      );
    });

    it("invalid token → 404 VET-PORTAL-0001", async () => {
      await expect(
        service.acceptInvitation({
          token: "00000000-0000-0000-0000-000000000000",
        }),
      ).rejects.toMatchObject({
        errorCode: "VET-PORTAL-0001",
        httpStatus: 404,
      });
    });

    it("expired invitation (süresi geçmiş) → 410 VET-PORTAL-0001, status expired işaretlenir", async () => {
      // expiresInDays=1 ile davet oluştur, sonra manuel olarak expiresAt'i geçmişe çek.
      const inv = await service.invite(
        TENANT_A,
        {
          ownerId: OWNER_ID_A,
          email: "x@y.com",
          patientIds: [PATIENT_ID_A],
          expiresInDays: 1,
          locale: "tr-TR",
        },
        STAFF_A,
      );
      // ExpiredAt'i geçmişe çek (in-memory repo doğrudan mutate edilemez; update ile yeni record).
      const pastIso = new Date(Date.now() - 60_000).toISOString();
      repo.update({ ...inv, expiresAt: pastIso });

      await expect(
        service.acceptInvitation({ token: inv.invitationToken }),
      ).rejects.toMatchObject({
        errorCode: "VET-PORTAL-0001",
        httpStatus: 410,
      });

      // Status expired olarak işaretlenmiş olmalı.
      const after = repo.findById(TENANT_A, inv.id);
      expect(after?.status).toBe("expired");
    });

    it("already accepted → 409 VET-PORTAL-0002", async () => {
      const inv = await service.invite(
        TENANT_A,
        {
          ownerId: OWNER_ID_A,
          email: "x@y.com",
          patientIds: [PATIENT_ID_A],
          expiresInDays: 7,
          locale: "tr-TR",
        },
        STAFF_A,
      );
      // İlk kabul başarılı.
      await service.acceptInvitation({ token: inv.invitationToken });
      // İkinci kabul → 409.
      await expect(
        service.acceptInvitation({ token: inv.invitationToken }),
      ).rejects.toMatchObject({
        errorCode: "VET-PORTAL-0002",
        httpStatus: 409,
      });
    });

    it("revoked invitation → 410 VET-PORTAL-0001", async () => {
      const inv = await service.invite(
        TENANT_A,
        {
          ownerId: OWNER_ID_A,
          email: "x@y.com",
          patientIds: [PATIENT_ID_A],
          expiresInDays: 7,
          locale: "tr-TR",
        },
        STAFF_A,
      );
      await service.revoke(TENANT_A, inv.id, STAFF_A);

      await expect(
        service.acceptInvitation({ token: inv.invitationToken }),
      ).rejects.toMatchObject({
        errorCode: "VET-PORTAL-0001",
        httpStatus: 410,
      });
    });
  });

  describe("revoke", () => {
    it("status pending → revoked, revokedAt set, audit (warning) yayınlanır", async () => {
      const inv = await service.invite(
        TENANT_A,
        {
          ownerId: OWNER_ID_A,
          email: "x@y.com",
          patientIds: [PATIENT_ID_A],
          expiresInDays: 7,
          locale: "tr-TR",
        },
        STAFF_A,
      );
      (audit.record as ReturnType<typeof vi.fn>).mockClear();

      const revoked = await service.revoke(TENANT_A, inv.id, STAFF_A);
      expect(revoked.status).toBe("revoked");
      expect(revoked.revokedAt).not.toBeNull();

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:portal.invite.revoke",
          action: "cancel",
          severity: "warning",
        }),
      );
    });

    it("already revoked → idempotent (mevcut kayıt döner, audit yeni event yayınlanmaz)", async () => {
      const inv = await service.invite(
        TENANT_A,
        {
          ownerId: OWNER_ID_A,
          email: "x@y.com",
          patientIds: [PATIENT_ID_A],
          expiresInDays: 7,
          locale: "tr-TR",
        },
        STAFF_A,
      );
      await service.revoke(TENANT_A, inv.id, STAFF_A);
      (audit.record as ReturnType<typeof vi.fn>).mockClear();

      const second = await service.revoke(TENANT_A, inv.id, STAFF_A);
      expect(second.status).toBe("revoked");
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("listForOwner", () => {
    it("tenant-scoped: sadece kendi tenant + ownerId eşleşen kayıtları döner", async () => {
      const a = await service.invite(
        TENANT_A,
        {
          ownerId: OWNER_ID_A,
          email: "a@y.com",
          patientIds: [PATIENT_ID_A],
          expiresInDays: 7,
          locale: "tr-TR",
        },
        STAFF_A,
      );
      // Tenant B'de de bir davet (cross-tenant test).
      await service.invite(
        TENANT_B,
        {
          ownerId: OWNER_ID_B,
          email: "b@y.com",
          patientIds: [PATIENT_ID_B],
          expiresInDays: 7,
          locale: "tr-TR",
        },
        STAFF_B,
      );

      const items = service.listForOwner(TENANT_A, OWNER_ID_A, STAFF_A);
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe(a.id);
    });
  });
});
