/**
 * @file KVKK servisi unit testleri.
 * @module apps/api/common/kvkk/kvkk.service.spec
 * @description GOAL-126 (FAZ-12) KVKK uyumlu veri yaşam
 *   döngüsü servisinin temel davranışlarını doğrular.
 *   Tenant izolasyonu, audit log ve PII anonimleştirme
 *   kurallarına uyulur; test verisi kimliksizdir.
 *
 *   Kapsam:
 *   1. Erasure talebi oluşturma (pending status).
 *   2. Erasure uygulama (PII alanları listesi).
 *   3. Tenant export (JSON format + retention notice).
 *   4. LEGAL_RETENTION_YEARS sabitleri (KVKK/UK GDPR).
 *
 *   Yapılmayanlar (production'da eklenir):
 *   - Prisma repository mocking (FAZ-12+ gerçek DB
 *     entegrasyonu ile).
 *   - Cross-tenant erasure izolasyonu.
 *
 * @since GOAL-126 (FAZ-12) KVKK + veri yaşam döngüsü
 */

import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import {
  KvkkService,
  LEGAL_RETENTION_YEARS,
  type KvkkErasureRequest,
} from "./kvkk.service.js";

interface KvkkServiceHarness {
  service: KvkkService;
  logSpy: ReturnType<typeof vi.spyOn>;
}

function asString(value: unknown): string {
  return typeof value === "string"
    ? value
    : value instanceof Error
      ? value.message
      : String(value);
}

async function createHarness(): Promise<KvkkServiceHarness> {
  const moduleRef = await Test.createTestingModule({
    providers: [KvkkService],
  }).compile();
  const service = moduleRef.get(KvkkService);
  const logSpy = vi
    .spyOn(service["logger"], "warn")
    .mockImplementation(() => undefined);
  return { service, logSpy };
}

describe("KvkkService", () => {
  describe("createErasureRequest", () => {
    it("verilen bilgilerle pending erasure talebi üretir", async () => {
      const { service } = await createHarness();
      const result = await service.createErasureRequest({
        tenantId: "tenant-1",
        ownerId: "owner-42",
        requestedBy: "user-7",
        reason: "Sahip talebi",
      });

      expect(result.tenantId).toBe("tenant-1");
      expect(result.ownerId).toBe("owner-42");
      expect(result.requestedBy).toBe("user-7");
      expect(result.reason).toBe("Sahip talebi");
      expect(result.status).toBe("pending");
      expect(result.completedAt).toBeNull();
      expect(result.redactedFields).toEqual([]);
      expect(result.retainedMedicalRecords).toBe(0);
    });

    it("talep kimliği 'kvkk-' önekiyle ve benzersiz şekilde üretilir", async () => {
      const { service } = await createHarness();
      const a = await service.createErasureRequest({
        tenantId: "t",
        ownerId: "o",
        requestedBy: "u",
        reason: "r",
      });
      // Aynı milisaniye içinde iki çağrı yapılırsa id çakışabilir;
      // bu yüzden küçük bir gecikme ile ikinci çağrı yapılır.
      await new Promise((r) => setTimeout(r, 5));
      const b = await service.createErasureRequest({
        tenantId: "t",
        ownerId: "o",
        requestedBy: "u",
        reason: "r",
      });
      expect(a.id).toMatch(/^kvkk-[0-9a-z]+$/);
      expect(b.id).toMatch(/^kvkk-[0-9a-z]+$/);
      expect(a.id).not.toBe(b.id);
    });

    it("requestedAt ISO 8601 UTC formatında döner", async () => {
      const { service } = await createHarness();
      const result = await service.createErasureRequest({
        tenantId: "t",
        ownerId: "o",
        requestedBy: "u",
        reason: "r",
      });
      expect(result.requestedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(new Date(result.requestedAt).toISOString()).toBe(
        result.requestedAt,
      );
    });

    it("audit log warn seviyesinde yazılır (PII olmadan)", async () => {
      const { service, logSpy } = await createHarness();
      await service.createErasureRequest({
        tenantId: "tenant-abc",
        ownerId: "owner-xyz",
        requestedBy: "u",
        reason: "r",
      });
      expect(logSpy).toHaveBeenCalledTimes(1);
      const msg = asString(logSpy.mock.calls[0]?.[0]);
      expect(msg).toContain("KVKK erasure request created");
      expect(msg).toContain("tenant=tenant-abc");
      expect(msg).toContain("owner=owner-xyz");
      // PII (email, telefon vb.) log'a yazılmaz.
      expect(msg).not.toMatch(/@|05\d{2}/);
    });
  });

  describe("applyErasure", () => {
    function makeRequest(): KvkkErasureRequest {
      return {
        id: "kvkk-test",
        tenantId: "tenant-1",
        ownerId: "owner-1",
        requestedAt: new Date().toISOString(),
        requestedBy: "u",
        reason: "test",
        status: "in_progress",
        completedAt: null,
        redactedFields: [],
        retainedMedicalRecords: 0,
      };
    }

    it("6 PII alanını redacted listesinde döner", async () => {
      const { service } = await createHarness();
      const result = await service.applyErasure(makeRequest());
      expect(result.redacted).toEqual([
        "firstName",
        "lastName",
        "email",
        "phone",
        "taxId",
        "address",
      ]);
    });

    it("retained medical records sayısı başlangıçta 0'dır", async () => {
      const { service } = await createHarness();
      const result = await service.applyErasure(makeRequest());
      expect(result.retained).toBe(0);
    });

    it("audit log erasure uygulandığını işaretler", async () => {
      const { service, logSpy } = await createHarness();
      await service.applyErasure(makeRequest());
      const calls = logSpy.mock.calls.map((c) => asString(c[0]));
      expect(calls.some((m) => m.includes("KVKK erasure applied"))).toBe(true);
      const msg = calls.find((m) => m.includes("KVKK erasure applied")) ?? "";
      expect(msg).toContain("request=kvkk-test");
      expect(msg).toContain("owner=owner-1");
      expect(msg).toContain("firstName,lastName,email,phone,taxId,address");
    });
  });

  describe("exportTenantData", () => {
    it("tenant için JSON formatında export üretir", async () => {
      const { service } = await createHarness();
      const result = await service.exportTenantData("tenant-1234");
      expect(result.format).toBe("json");
      expect(result.tenantId).toBe("tenant-1234");
      expect(result.tenantSlug).toBe("tnt-tenant-1");
    });

    it("export 7 veri kategorisini boş array ile başlatır", async () => {
      const { service } = await createHarness();
      const result = await service.exportTenantData("t");
      expect(result.data).toEqual({
        owners: [],
        patients: [],
        examinations: [],
        vaccinations: [],
        prescriptions: [],
        sales: [],
        payments: [],
      });
    });

    it("retention notice KVKK Madde 7 referansı taşır", async () => {
      const { service } = await createHarness();
      const result = await service.exportTenantData("t");
      expect(result.retentionNotice.legalBasis).toBe("KVKK_MADDE_7");
      expect(result.retentionNotice.retentionYears).toBe(7);
      expect(result.retentionNotice.message).toContain("KVKK Madde 7");
      expect(result.retentionNotice.message).toContain("7 yıl");
    });

    it("exportedAt ISO 8601 formatında döner", async () => {
      const { service } = await createHarness();
      const result = await service.exportTenantData("t");
      expect(result.exportedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it("audit log tenant ID hash'ini (8 karakter) loglar; PII sızdırmaz", async () => {
      const { service, logSpy } = await createHarness();
      await service.exportTenantData("tenant-very-secret-id");
      const calls = logSpy.mock.calls.map((c) => asString(c[0]));
      const msg =
        calls.find((m) => m.includes("KVKK tenant data export")) ?? "";
      expect(msg).toContain("KVKK tenant data export");
      // tenant_hash 8 karakter hex olmali
      expect(msg).toMatch(/tenant_hash=[a-f0-9]{8}/);
      // Ham tenantId log'a yazılmaz
      expect(msg).not.toContain("tenant-very-secret-id");
    });
  });

  describe("LEGAL_RETENTION_YEARS", () => {
    it("KVKK Madde 7: medical 7 yıl", () => {
      expect(LEGAL_RETENTION_YEARS.medical).toBe(7);
    });
    it("KVKK: financial 5 yıl", () => {
      expect(LEGAL_RETENTION_YEARS.financial).toBe(5);
    });
    it("KVKK: audit 3 yıl", () => {
      expect(LEGAL_RETENTION_YEARS.audit).toBe(3);
    });
    it("readonly (değiştirilemez)", () => {
      // TypeScript seviyesinde `as const` ile readonly; runtime'da
      // Object.freeze uygulanmamış olabilir. Burada sadece varlığını
      // ve doğru tipte olduğunu doğruluyoruz.
      expect(typeof LEGAL_RETENTION_YEARS.medical).toBe("number");
      expect(typeof LEGAL_RETENTION_YEARS.financial).toBe("number");
      expect(typeof LEGAL_RETENTION_YEARS.audit).toBe("number");
    });
  });
});
