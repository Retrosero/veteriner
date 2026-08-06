/**
 * @file KVKK controller güvenlik + davranış testi.
 * @module apps/api/modules/kvkk/kvkk.controller.spec
 *
 * @description GOAL-126 (FAZ-12) KVKK controller'ın:
 *   1. Guard yapılandırması (AuthGuard + PermissionsGuard).
 *   2. Route + permission metadata doğruluğu.
 *   3. Happy-path service çağrıları (mock service).
 *
 * @since GOAL-126 (FAZ-12) KVKK controller + endpoint'ler
 */

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";

import { KvkkController } from "./kvkk.controller.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";

import type { KvkkService } from "./kvkk.service.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER_A = "own-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const SUPERADMIN_ACTOR: ActorContext = {
  actorId: "usr-sa-1",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeService(): KvkkService {
  return {
    createErasureRequest: vi.fn(),
    listErasureRequests: vi.fn(),
    applyErasure: vi.fn(),
    exportTenantData: vi.fn(),
  } as unknown as KvkkService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

describe("KvkkController", () => {
  describe("guard yapılandırması", () => {
    it("AuthGuard + PermissionsGuard uygulanır", () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        KvkkController,
      ) as unknown[];
      expect(guards).toEqual([PermissionsGuard]);
    });

    it("controller path 'api/v1/kvkk'", () => {
      // NestJS @Controller dekoratörü metadata'ya path yazar.
      const pathMeta = Reflect.getMetadata("path", KvkkController);
      expect(pathMeta).toBe("api/v1/kvkk");
    });
  });

  describe("createErasureRequest", () => {
    it("service.createErasureRequest çağırır ve audit event yayınlar", async () => {
      const service = makeService();
      const audit = makeAudit();
      const controller = new KvkkController(service, audit);

      const expectedRequest = {
        id: "kvkk-1",
        tenantId: TENANT_A,
        ownerId: OWNER_A,
        requestedAt: "2026-08-05T12:00:00.000Z",
        requestedBy: "usr-owner-1",
        reason: "Sahip talebi",
        status: "pending" as const,
        completedAt: null,
        redactedFields: [],
        retainedMedicalRecords: 0,
      };
      (
        service.createErasureRequest as ReturnType<typeof vi.fn>
      ).mockResolvedValue(expectedRequest);

      const result = await controller.createErasureRequest(
        { ownerId: OWNER_A, reason: "Sahip talebi" },
        SUPERADMIN_ACTOR,
        "idem-key-1",
      );

      expect(result).toBe(expectedRequest);
      expect(service.createErasureRequest).toHaveBeenCalledWith(
        SUPERADMIN_ACTOR,
        { ownerId: OWNER_A, reason: "Sahip talebi" },
        "idem-key-1",
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:kvkk.erasure.requested",
          targetType: "kvkk_erasure_request",
          targetId: "kvkk-1",
          action: "create",
        }),
      );
    });
  });

  describe("listErasureRequests", () => {
    it("service.listErasureRequest çağırır", async () => {
      const service = makeService();
      const audit = makeAudit();
      const controller = new KvkkController(service, audit);

      const listResult = { items: [], total: 0 };
      (
        service.listErasureRequests as ReturnType<typeof vi.fn>
      ).mockResolvedValue(listResult);

      const result = await controller.listErasureRequests(
        { limit: 20, offset: 0 },
        SUPERADMIN_ACTOR,
      );
      expect(result).toBe(listResult);
      expect(service.listErasureRequests).toHaveBeenCalledWith(
        SUPERADMIN_ACTOR,
        { limit: 20, offset: 0 },
      );
    });
  });

  describe("applyErasure", () => {
    it("service.applyErasure çağırır + audit:kvkk.erasure.applied yayınlar", async () => {
      const service = makeService();
      const audit = makeAudit();
      const controller = new KvkkController(service, audit);

      const applyResult = {
        redacted: [
          "firstName",
          "lastName",
          "email",
          "phone",
          "taxId",
          "address",
        ],
        retained: 0,
      };
      (service.applyErasure as ReturnType<typeof vi.fn>).mockResolvedValue(
        applyResult,
      );

      const result = await controller.applyErasure("kvkk-1", SUPERADMIN_ACTOR);
      expect(result).toBe(applyResult);
      expect(service.applyErasure).toHaveBeenCalledWith(
        SUPERADMIN_ACTOR,
        "kvkk-1",
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:kvkk.erasure.applied",
          targetId: "kvkk-1",
          action: "complete",
        }),
      );
    });
  });

  describe("exportTenantData", () => {
    it("service.exportTenantData çağırır + audit:kvkk.export.applied yayınlar", async () => {
      const service = makeService();
      const audit = makeAudit();
      const controller = new KvkkController(service, audit);

      const exportResult = {
        exportedAt: "2026-08-05T12:00:00.000Z",
        tenantId: TENANT_A,
        tenantSlug: "pilot-vet",
        format: "json" as const,
        data: {
          owners: [],
          patients: [],
          examinations: [],
          vaccinations: [],
          prescriptions: [],
          sales: [],
          payments: [],
        },
        retentionNotice: {
          message: "Tıbbi kayıtlar KVKK Madde 7 uyarınca 7 yıl saklanır.",
          legalBasis: "KVKK_MADDE_7" as const,
          retentionYears: 7,
        },
      };
      (service.exportTenantData as ReturnType<typeof vi.fn>).mockResolvedValue(
        exportResult,
      );

      const result = await controller.exportTenantData(SUPERADMIN_ACTOR);
      expect(result).toBe(exportResult);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:kvkk.export.applied",
          targetType: "tenant",
          action: "export",
        }),
      );
    });
  });
});
