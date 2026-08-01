/**
 * @file ConsentsService unit testleri.
 * @module apps/api/modules/consents/consents.service.spec
 * @description GOAL-081 onam formu service testleri.
 *   - createConsent (taslak + audit).
 *   - signConsent (draft → signed + signedAt + audit).
 *   - revokeConsent (signed → revoked; revoked 409;
 *     draft 409 VET-CONSENT-0004).
 *   - listConsents / getConsentDetail.
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 * @since GOAL-081 (FAZ-8) onam formları core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConsentsRepository } from "./consents.repository.js";
import { ConsentsService } from "./consents.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  ConsentCreateInput,
  ConsentRevokeInput,
  ConsentSignInput,
} from "@vetniva/contracts";

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

const OWNER_A: ActorContext = {
  actorId: "usr-owner-a",
  actorType: "user",
  role: "OWNER",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
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
  correlationId: "req-3",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

/**
 *
 */
function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi
      .fn()
      .mockImplementation(
        async (
          _eventName: string,
          _targetType: string,
          _targetId: string,
          _action: string,
          _actor: unknown,
          _severity: string,
        ) => ({ eventId: "ev-1" }),
      ),
  } as unknown as AuditService;
}

const PATIENT_A = "00000000-0000-0000-0000-000000000001";
const OWNER_UUID = "00000000-0000-0000-0000-000000000002";

/**
 *
 * @param overrides
 */
function makeCreateInput(
  overrides: Partial<ConsentCreateInput> = {},
): ConsentCreateInput {
  return {
    templateType: "surgery",
    templateVersion: "v1.0.0",
    patientId: PATIENT_A,
    ownerId: OWNER_UUID,
    locale: "tr",
    ...overrides,
  };
}

describe("ConsentsService", () => {
  let service: ConsentsService;
  let repo: ConsentsRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new ConsentsRepository();
    audit = makeAudit();
    service = new ConsentsService(repo, audit);
  });

  // ---------------------------------------------------------------------------
  // createConsent
  // ---------------------------------------------------------------------------

  describe("createConsent", () => {
    it("taslak oluşturur + audit", async () => {
      const out = await service.createConsent(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      expect(out.id).toMatch(/^cs-/);
      expect(out.status).toBe("draft");
      expect(out.templateType).toBe("surgery");
      expect(out.templateVersion).toBe("v1.0.0");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:consent.create",
        "consent",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ templateType: "surgery" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // signConsent
  // ---------------------------------------------------------------------------

  describe("signConsent", () => {
    it("draft → signed + signedAt set", async () => {
      const created = await service.createConsent(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const signed = await service.signConsent(
        TENANT_A,
        created.id,
        { signatureMethod: "manual" } as ConsentSignInput,
        OWNER_A,
      );
      expect(signed.status).toBe("signed");
      expect(signed.signatureMethod).toBe("manual");
      expect(signed.signedAt).not.toBeNull();
    });

    it("electronic + provider ile imzalama", async () => {
      const created = await service.createConsent(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const signed = await service.signConsent(
        TENANT_A,
        created.id,
        {
          signatureMethod: "electronic",
          signatureProvider: "docusign",
          signatureReference: "ds-123",
        } as ConsentSignInput,
        OWNER_A,
      );
      expect(signed.signatureMethod).toBe("electronic");
      expect(signed.signatureProvider).toBe("docusign");
      expect(signed.signatureReference).toBe("ds-123");
    });

    it("signed form tekrar imzalanamaz 409 VET-CONSENT-0002", async () => {
      const created = await service.createConsent(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.signConsent(
        TENANT_A,
        created.id,
        { signatureMethod: "manual" } as ConsentSignInput,
        OWNER_A,
      );
      await expect(
        service.signConsent(
          TENANT_A,
          created.id,
          { signatureMethod: "manual" } as ConsentSignInput,
          OWNER_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CONSENT-0002",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // revokeConsent
  // ---------------------------------------------------------------------------

  describe("revokeConsent", () => {
    it("signed → revoked + cancelReason set", async () => {
      const created = await service.createConsent(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.signConsent(
        TENANT_A,
        created.id,
        { signatureMethod: "manual" } as ConsentSignInput,
        OWNER_A,
      );
      const revoked = await service.revokeConsent(
        TENANT_A,
        created.id,
        { reason: "vazgeçti" } as ConsentRevokeInput,
        OWNER_A,
      );
      expect(revoked.status).toBe("revoked");
      expect(revoked.revokeReason).toBe("vazgeçti");
    });

    it("draft geri çekilemez 409 VET-CONSENT-0004", async () => {
      const created = await service.createConsent(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await expect(
        service.revokeConsent(
          TENANT_A,
          created.id,
          { reason: "x" } as ConsentRevokeInput,
          OWNER_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CONSENT-0004",
        httpStatus: 409,
      });
    });

    it("zaten revoked → 409 VET-CONSENT-0003", async () => {
      const created = await service.createConsent(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.signConsent(
        TENANT_A,
        created.id,
        { signatureMethod: "manual" } as ConsentSignInput,
        OWNER_A,
      );
      await service.revokeConsent(
        TENANT_A,
        created.id,
        { reason: "ilk" } as ConsentRevokeInput,
        OWNER_A,
      );
      await expect(
        service.revokeConsent(
          TENANT_A,
          created.id,
          { reason: "ikinci" } as ConsentRevokeInput,
          OWNER_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CONSENT-0003",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listConsents / getConsentDetail
  // ---------------------------------------------------------------------------

  describe("listConsents", () => {
    it("tenant-scoped; status filtresi çalışır", async () => {
      const a = await service.createConsent(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.createConsent(TENANT_A, makeCreateInput(), STAFF_A);
      const b = await service.signConsent(
        TENANT_A,
        a.id,
        { signatureMethod: "manual" } as ConsentSignInput,
        OWNER_A,
      );
      expect(b.status).toBe("signed");
      const list = await service.listConsents(
        TENANT_A,
        { status: "signed", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
    });
  });

  describe("getConsentDetail", () => {
    it("cross-tenant IDOR → null", async () => {
      const created = await service.createConsent(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const c = await service.getConsentDetail(TENANT_B, created.id, STAFF_B);
      expect(c).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createConsent(TENANT_B, makeCreateInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
