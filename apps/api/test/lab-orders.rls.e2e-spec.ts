/**
 * @file Lab Orders PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle lab_orders tablosunu doğrular. Tenant bağlamı yokken
 * satır okunamaz veya yazılamaz; doğru bağlam yalnızca ilgili tenant'ın
 * satırlarını açar. Append-only trigger'ı RLS bağlamı doğru olsa dahi
 * DELETE'i reddetmelidir. Test rolü yalnızca geçici E2E veritabanında
 * oluşturulur.
 *
 * W1.2b (GOAL-091) kapsamında in-memory'den DB'ye taşınan modülün RLS e2e
 * doğrulaması. lab_tests + patients + owners tabloları admin ile seed edilir.
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LabOrdersRepository } from "../src/modules/lab-orders/lab-orders.repository.js";

import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { Prisma } from "@prisma/client";

// Skip guard — DB yoksa lint/type-check/test gate'lerini kırmadan skip.
const migratorDatabaseUrl = process.env["DATABASE_MIGRATOR_URL"];
const runtimeDatabaseUrl = process.env["DATABASE_URL"];
const rlsSkip = !migratorDatabaseUrl || !runtimeDatabaseUrl;
const describeDb = rlsSkip ? describe.skip : describe;
if (rlsSkip) {
  console.warn(
    "[lab-orders.rls] DATABASE_MIGRATOR_URL/DATABASE_URL yok; senaryo skip edilecek.",
  );
}

const STUB_DATABASE_URL = "postgresql://stub:stub@localhost:5432/stub";

const adminPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl ?? STUB_DATABASE_URL } },
});
const appRoleName = "vetniva_e2e_lab_orders_app";

const appDatabaseUrl = new URL(runtimeDatabaseUrl ?? STUB_DATABASE_URL);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-lab-orders-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const labOrdersRepository = new LabOrdersRepository(
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
const seededOrderAId = randomUUID();
const seededOrderBId = randomUUID();
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

describeDb("Lab Orders PostgreSQL RLS", () => {
  beforeAll(async () => {
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-lab-orders-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE lab_orders TO ${appRoleName}`,
    );
    // lab_orders FK'leri için gerekli tablolar (RLS context olmadan
    // admin/seed tarafında sorgulanır; test'te app rolü bunlara erişmez).
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE tenants, lab_tests, patients, owners TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `lo-rls-a-${tenantAId}`,
          name: "Lab Orders RLS Tenant A",
          country: "TR",
        },
        {
          id: tenantBId,
          slug: `lo-rls-b-${tenantBId}`,
          name: "Lab Orders RLS Tenant B",
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
    await adminPrisma.labOrder.create({
      data: {
        id: seededOrderAId,
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
    });
    await adminPrisma.labOrder.create({
      data: {
        id: seededOrderBId,
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
    });
  });

  afterAll(async () => {
    await appPrisma.$disconnect();
    await dropTestRole();
    await adminPrisma.$disconnect();
  });

  it("tenant bağlamı yokken lab_orders satırı göstermez veya yazdırmaz", async () => {
    await expect(appPrisma.labOrder.findMany()).resolves.toEqual([]);
    await expect(
      appPrisma.labOrder.create({
        data: {
          tenantId: tenantAId,
          patientId: patientAId,
          labTestId: labTestAId,
          labTestCode: "CBC-A",
          labTestName: "CBC for tenant A",
          sampleType: "blood",
          unit: "x",
          referenceRange: null,
          price: "1.0000",
          sourceType: "manual",
          sourceId: null,
          priority: "routine",
          status: "ordered",
          createdBy: "rls-e2e",
        },
      }),
    ).rejects.toBeDefined();
  });

  it("doğru tenant bağlamı yalnızca kendi kaydını açar", async () => {
    const visibleIds = await withTenant(tenantAId, async (tx) => {
      const rows = await tx.labOrder.findMany({ orderBy: { id: "asc" } });
      return rows.map((r) => r.id);
    });
    const otherTenantIds = await withTenant(tenantBId, async (tx) => {
      const rows = await tx.labOrder.findMany({ orderBy: { id: "asc" } });
      return rows.map((r) => r.id);
    });

    expect(visibleIds).toContain(seededOrderAId);
    expect(visibleIds).not.toContain(seededOrderBId);

    expect(otherTenantIds).toContain(seededOrderBId);
    expect(otherTenantIds).not.toContain(seededOrderAId);
  });

  it("Repository findById tenant-scoped: cross-tenant null döner", async () => {
    const inTenantA = await labOrdersRepository.findById(
      tenantAId,
      seededOrderAId,
    );
    const inTenantBWithForeignId = await labOrdersRepository.findById(
      tenantBId,
      seededOrderAId,
    );
    const inTenantAWithBOrderId = await labOrdersRepository.findById(
      tenantAId,
      seededOrderBId,
    );

    expect(inTenantA?.id).toBe(seededOrderAId);
    expect(inTenantBWithForeignId).toBeNull();
    expect(inTenantAWithBOrderId).toBeNull();
  });

  it("Repository search tenant-scoped: status filtresi yalnızca kendi tenant'ında çalışır", async () => {
    const aResults = await labOrdersRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      status: "ordered",
    });
    const bResults = await labOrdersRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
      status: "ordered",
    });

    expect(aResults.items.map((r) => r.id)).toEqual([seededOrderAId]);
    expect(aResults.total).toBe(1);
    expect(bResults.items.map((r) => r.id)).toEqual([seededOrderBId]);
    expect(bResults.total).toBe(1);
  });

  it("Repository search patient filtresi yalnızca kendi tenant'ında eşleşir", async () => {
    const aResults = await labOrdersRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      patientId: patientBId,
    });
    const bResults = await labOrdersRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
      patientId: patientAId,
    });

    // patientId doğru olsa bile cross-tenant RLS 0 satır döner.
    expect(aResults.items).toEqual([]);
    expect(aResults.total).toBe(0);
    expect(bResults.items).toEqual([]);
    expect(bResults.total).toBe(0);
  });

  it("Repository insert kendi tenant context'inde yeni kayıt ekler", async () => {
    const inserted = await labOrdersRepository.insert({
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
      createdBy: "rls-e2e",
      notes: "Inserted via RLS test",
    });

    expect(inserted.tenantId).toBe(tenantAId);
    expect(inserted.status).toBe("ordered");
    expect(inserted.notes).toBe("Inserted via RLS test");

    const visible = await withTenant(tenantAId, async (tx) =>
      tx.labOrder.findUnique({ where: { id: inserted.id } }),
    );
    const invisible = await withTenant(tenantBId, async (tx) =>
      tx.labOrder.findUnique({ where: { id: inserted.id } }),
    );

    expect(visible?.id).toBe(inserted.id);
    expect(invisible).toBeNull();
  });

  it("Repository update doğru tenant'ta başarılı", async () => {
    const updated = await labOrdersRepository.update(
      tenantAId,
      seededOrderAId,
      { status: "collected", sampleQuality: "ok" },
    );
    expect(updated?.id).toBe(seededOrderAId);
    expect(updated?.status).toBe("collected");
    expect(updated?.sampleQuality).toBe("ok");
  });

  it("Repository update cross-tenant: P2025/null ile sonuçlanır", async () => {
    // Tenant A'nın actor'ı ile Tenant B'ye ait bir order'ı güncellemek
    // → RLS USING clause o satırı göstermediği için 0 satır etkilenir
    // → P2025 → repository null döner.
    const result = await labOrdersRepository.update(tenantAId, seededOrderBId, {
      status: "cancelled",
      cancelReason: "cross-tenant probe",
    });
    expect(result).toBeNull();

    const untouched = await adminPrisma.labOrder.findUnique({
      where: { id: seededOrderBId },
    });
    expect(untouched?.status).toBe("ordered");
    expect(untouched?.cancelReason).toBeNull();
  });

  it("Append-only trigger tenant bağlamı doğru olsa dahi DELETE'i reddeder", async () => {
    await expect(
      withTenant(tenantAId, async (tx) =>
        tx.labOrder.delete({ where: { id: seededOrderAId } }),
      ),
    ).rejects.toBeDefined();

    const stillThere = await adminPrisma.labOrder.findUnique({
      where: { id: seededOrderAId },
    });
    expect(stillThere?.id).toBe(seededOrderAId);
  });

  it("App role yalnızca lab_orders SELECT/INSERT/UPDATE yetkisine sahiptir", async () => {
    const privs = await adminPrisma.$queryRawUnsafe<
      Array<{ privilege_type: string }>
    >(`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = '${appRoleName}'
        AND table_name = 'lab_orders'
      ORDER BY privilege_type;
    `);
    const types = privs.map((p) => p.privilege_type);
    expect(types).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });
});
