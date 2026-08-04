/**
 * @file Lab Results PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle lab_results tablosunu doğrular. Tenant bağlamı yokken
 * satır okunamaz veya yazılamaz; doğru bağlam yalnızca ilgili tenant'ın
 * satırlarını açar. Append-only trigger'ı RLS bağlamı doğru olsa dahi
 * DELETE'i reddetmelidir. Test rolü yalnızca geçici E2E veritabanında
 * oluşturulur.
 *
 * W1.2c (GOAL-092) kapsamında in-memory'den DB'ye taşınan modülün RLS e2e
 * doğrulaması. lab_results → lab_orders → patients zinciri admin ile seed
 * edilir.
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LabResultsRepository } from "../src/modules/lab-results/lab-results.repository.js";

import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { Prisma } from "@prisma/client";

const migratorDatabaseUrl = process.env["DATABASE_MIGRATOR_URL"];

if (!migratorDatabaseUrl) {
  throw new Error(
    "DATABASE_MIGRATOR_URL zorunludur; RLS E2E fixture/rol bootstrap'ı runtime uygulama rolüyle çalıştırılamaz.",
  );
}

const adminPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl } },
});
const appRoleName = "vetniva_e2e_lab_results_app";
const runtimeDatabaseUrl = process.env["DATABASE_URL"];

if (!runtimeDatabaseUrl) {
  throw new Error("DATABASE_URL zorunludur.");
}

const appDatabaseUrl = new URL(runtimeDatabaseUrl);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-lab-results-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const labResultsRepository = new LabResultsRepository(
  appPrisma as unknown as PrismaService,
);

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const ownerAId = randomUUID();
const ownerBId = randomUUID();
const patientAId = randomUUID();
const patientBId = randomUUID();
const labTestAId = randomUUID();
const labTestBId = randomUUID();
const labOrderAId = randomUUID();
const labOrderBId = randomUUID();
const seededResultAId = randomUUID();
const seededResultBId = randomUUID();
type TransactionClient = Prisma.TransactionClient;

async function withTenant<T>(
  tenantId: string,
  action: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
    return action(tx);
  });
}

async function dropTestRole(): Promise<void> {
  await adminPrisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRoleName}') THEN
        DROP OWNED BY ${appRoleName};
        DROP ROLE ${appRoleName};
      END IF;
    END
    $$;
  `);
}

describe("Lab Results PostgreSQL RLS", () => {
  beforeAll(async () => {
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-lab-results-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE lab_results TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE tenants, lab_tests, lab_orders, patients, owners TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `lr-rls-a-${tenantAId}`,
          name: "Lab Results RLS Tenant A",
          country: "TR",
        },
        {
          id: tenantBId,
          slug: `lr-rls-b-${tenantBId}`,
          name: "Lab Results RLS Tenant B",
          country: "TR",
        },
      ],
    });
    await adminPrisma.owner.createMany({
      data: [
        {
          id: ownerAId,
          tenantId: tenantAId,
          firstName: "Owner",
          lastName: "A",
          phone: "1111111111",
        },
        {
          id: ownerBId,
          tenantId: tenantBId,
          firstName: "Owner",
          lastName: "B",
          phone: "2222222222",
        },
      ],
    });
    await adminPrisma.patient.createMany({
      data: [
        {
          id: patientAId,
          tenantId: tenantAId,
          ownerId: ownerAId,
          name: "Patient A",
          species: "dog",
          gender: "female",
          neutered: false,
        },
        {
          id: patientBId,
          tenantId: tenantBId,
          ownerId: ownerBId,
          name: "Patient B",
          species: "cat",
          gender: "male",
          neutered: true,
        },
      ],
    });
    await adminPrisma.labTest.createMany({
      data: [
        {
          id: labTestAId,
          tenantId: tenantAId,
          code: "CBC-A",
          name: "CBC for tenant A",
          sampleType: "blood",
          unit: "x",
          referenceRange: null,
          conditionalRanges: null,
          price: "100.0000",
          active: true,
          notes: null,
          createdBy: "rls-e2e",
        },
        {
          id: labTestBId,
          tenantId: tenantBId,
          code: "CBC-B",
          name: "CBC for tenant B",
          sampleType: "blood",
          unit: "x",
          referenceRange: null,
          conditionalRanges: null,
          price: "100.0000",
          active: true,
          notes: null,
          createdBy: "rls-e2e",
        },
      ],
    });
    await adminPrisma.labOrder.createMany({
      data: [
        {
          id: labOrderAId,
          tenantId: tenantAId,
          patientId: patientAId,
          labTestId: labTestAId,
          labTestCode: "CBC-A",
          labTestName: "CBC for tenant A",
          sampleType: "blood",
          unit: "x",
          referenceRange: null,
          price: "100.0000",
          sourceType: "manual",
          sourceId: null,
          priority: "routine",
          status: "ordered",
          createdBy: "rls-e2e",
        },
        {
          id: labOrderBId,
          tenantId: tenantBId,
          patientId: patientBId,
          labTestId: labTestBId,
          labTestCode: "CBC-B",
          labTestName: "CBC for tenant B",
          sampleType: "blood",
          unit: "x",
          referenceRange: null,
          price: "100.0000",
          sourceType: "manual",
          sourceId: null,
          priority: "routine",
          status: "ordered",
          createdBy: "rls-e2e",
        },
      ],
    });
    await adminPrisma.labResult.createMany({
      data: [
        {
          id: seededResultAId,
          tenantId: tenantAId,
          labOrderId: labOrderAId,
          revision: 1,
          value: "8500",
          valueNumeric: "8500",
          unit: "cells/mcL",
          referenceRange: "4000-11000",
          abnormalFlag: "normal",
          status: "draft",
          attachments: [],
          notes: "Seed A",
          enteredBy: "rls-e2e",
        },
        {
          id: seededResultBId,
          tenantId: tenantBId,
          labOrderId: labOrderBId,
          revision: 1,
          value: "9200",
          valueNumeric: "9200",
          unit: "cells/mcL",
          referenceRange: "4000-11000",
          abnormalFlag: "normal",
          status: "draft",
          attachments: [],
          notes: "Seed B",
          enteredBy: "rls-e2e",
        },
      ],
    });
  });

  afterAll(async () => {
    await appPrisma.$disconnect();
    await dropTestRole();
    await adminPrisma.$disconnect();
  });

  it("tenant bağlamı yokken lab_results satırı göstermez veya yazdırmaz", async () => {
    await expect(appPrisma.labResult.findMany()).resolves.toEqual([]);
    await expect(
      appPrisma.labResult.create({
        data: {
          tenantId: tenantAId,
          labOrderId: labOrderAId,
          revision: 99,
          value: "x",
          valueNumeric: null,
          unit: "x",
          referenceRange: null,
          abnormalFlag: "normal",
          status: "draft",
          attachments: [],
          notes: null,
          enteredBy: "rls-e2e",
        },
      }),
    ).rejects.toBeDefined();
  });

  it("doğru tenant bağlamı yalnızca kendi kaydını açar", async () => {
    const visibleIds = await withTenant(tenantAId, async (tx) => {
      const rows = await tx.labResult.findMany({ orderBy: { id: "asc" } });
      return rows.map((r) => r.id);
    });
    const otherTenantIds = await withTenant(tenantBId, async (tx) => {
      const rows = await tx.labResult.findMany({ orderBy: { id: "asc" } });
      return rows.map((r) => r.id);
    });

    expect(visibleIds).toContain(seededResultAId);
    expect(visibleIds).not.toContain(seededResultBId);

    expect(otherTenantIds).toContain(seededResultBId);
    expect(otherTenantIds).not.toContain(seededResultAId);
  });

  it("Repository findById tenant-scoped: cross-tenant null döner", async () => {
    const inTenantA = await labResultsRepository.findById(
      tenantAId,
      seededResultAId,
    );
    const inTenantBWithForeignId = await labResultsRepository.findById(
      tenantBId,
      seededResultAId,
    );
    const inTenantAWithBResultId = await labResultsRepository.findById(
      tenantAId,
      seededResultBId,
    );

    expect(inTenantA?.id).toBe(seededResultAId);
    expect(inTenantBWithForeignId).toBeNull();
    expect(inTenantAWithBResultId).toBeNull();
  });

  it("Repository listByOrder yalnızca kendi tenant'ının sonuçlarını döner", async () => {
    const aResults = await labResultsRepository.listByOrder(
      tenantAId,
      labOrderAId,
    );
    const aResultsForBOrder = await labResultsRepository.listByOrder(
      tenantAId,
      labOrderBId,
    );
    const bResults = await labResultsRepository.listByOrder(
      tenantBId,
      labOrderBId,
    );

    expect(aResults.map((r) => r.id)).toEqual([seededResultAId]);
    // RLS: doğru tenant context olsa bile başka tenant'ın order'ı görünmez.
    expect(aResultsForBOrder).toEqual([]);
    expect(bResults.map((r) => r.id)).toEqual([seededResultBId]);
  });

  it("Repository findActiveByOrder tenant-scoped: cross-tenant null döner", async () => {
    const inTenantA = await labResultsRepository.findActiveByOrder(
      tenantAId,
      labOrderAId,
    );
    const inTenantAForBOrder = await labResultsRepository.findActiveByOrder(
      tenantAId,
      labOrderBId,
    );

    expect(inTenantA?.id).toBe(seededResultAId);
    expect(inTenantAForBOrder).toBeNull();
  });

  it("Repository nextRevision tenant-scoped: kendi tenant'ında doğru artar", async () => {
    const aNext = await labResultsRepository.nextRevision(
      tenantAId,
      labOrderAId,
    );
    const aNextForBOrder = await labResultsRepository.nextRevision(
      tenantAId,
      labOrderBId,
    );
    const bNext = await labResultsRepository.nextRevision(
      tenantBId,
      labOrderBId,
    );

    expect(aNext).toBe(2);
    // B'nin order'ı RLS tarafından görünmez → last null → 1.
    expect(aNextForBOrder).toBe(1);
    expect(bNext).toBe(2);
  });

  it("Repository insert kendi tenant context'inde yeni kayıt ekler", async () => {
    const inserted = await labResultsRepository.insert({
      tenantId: tenantAId,
      labOrderId: labOrderAId,
      revision: 2,
      value: "9000",
      valueNumeric: "9000",
      unit: "cells/mcL",
      referenceRange: "4000-11000",
      abnormalFlag: "normal",
      attachments: [],
      notes: "Second revision (RLS test)",
      enteredBy: "rls-e2e",
      amendsResultId: null,
      amendmentReason: null,
    });

    expect(inserted.tenantId).toBe(tenantAId);
    expect(inserted.revision).toBe(2);
    expect(inserted.value).toBe("9000");

    const visible = await withTenant(tenantAId, async (tx) =>
      tx.labResult.findUnique({ where: { id: inserted.id } }),
    );
    const invisible = await withTenant(tenantBId, async (tx) =>
      tx.labResult.findUnique({ where: { id: inserted.id } }),
    );

    expect(visible?.id).toBe(inserted.id);
    expect(invisible).toBeNull();
  });

  it("Repository update doğru tenant'ta başarılı", async () => {
    const updated = await labResultsRepository.update(
      tenantAId,
      seededResultAId,
      { status: "pending_review", reviewNotes: "Looks plausible" },
    );
    expect(updated?.id).toBe(seededResultAId);
    expect(updated?.status).toBe("pending_review");
    expect(updated?.reviewNotes).toBe("Looks plausible");
  });

  it("Repository update cross-tenant: P2025/null ile sonuçlanır", async () => {
    const result = await labResultsRepository.update(
      tenantAId,
      seededResultBId,
      { value: "tampered" },
    );
    expect(result).toBeNull();

    const untouched = await adminPrisma.labResult.findUnique({
      where: { id: seededResultBId },
    });
    expect(untouched?.value).toBe("9200");
  });

  it("Append-only trigger tenant bağlamı doğru olsa dahi DELETE'i reddeder", async () => {
    await expect(
      withTenant(tenantAId, async (tx) =>
        tx.labResult.delete({ where: { id: seededResultAId } }),
      ),
    ).rejects.toBeDefined();

    const stillThere = await adminPrisma.labResult.findUnique({
      where: { id: seededResultAId },
    });
    expect(stillThere?.id).toBe(seededResultAId);
  });

  it("App role yalnızca lab_results SELECT/INSERT/UPDATE yetkisine sahiptir", async () => {
    const privs = await adminPrisma.$queryRawUnsafe<
      Array<{ privilege_type: string }>
    >(`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = '${appRoleName}'
        AND table_name = 'lab_results'
      ORDER BY privilege_type;
    `);
    const types = privs.map((p) => p.privilege_type);
    expect(types).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });
});
