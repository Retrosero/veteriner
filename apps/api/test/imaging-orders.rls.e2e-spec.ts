/**
 * @file Imaging Orders PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle imaging_orders tablosunu doğrular. Tenant bağlamı yokken
 * satır okunamaz veya yazılamaz; doğru bağlam yalnızca ilgili tenant'ın
 * satırlarını açar. Append-only trigger'ı RLS bağlamı doğru olsa dahi
 * DELETE'i reddetmelidir. Test rolü yalnızca geçici E2E veritabanında
 * oluşturulur.
 *
 * W1.2d (GOAL-093) kapsamında in-memory'den DB'ye taşınan modülün RLS e2e
 * doğrulaması. imaging_orders → patients zinciri admin ile seed edilir.
 * `imagingTestId` bir UUID olup ayrı bir katalog tablosuna bağlı değildir
 * (dahili katalog snapshot).
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ImagingOrdersRepository } from "../src/modules/imaging-orders/imaging-orders.repository.js";

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
const appRoleName = "vetniva_e2e_imaging_orders_app";
const runtimeDatabaseUrl = process.env["DATABASE_URL"];

if (!runtimeDatabaseUrl) {
  throw new Error("DATABASE_URL zorunludur.");
}

const appDatabaseUrl = new URL(runtimeDatabaseUrl);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-imaging-orders-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const imagingOrdersRepository = new ImagingOrdersRepository(
  appPrisma as unknown as PrismaService,
);

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const ownerAId = randomUUID();
const ownerBId = randomUUID();
const patientAId = randomUUID();
const patientBId = randomUUID();
const imagingTestAId = randomUUID();
const imagingTestBId = randomUUID();
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

describe("Imaging Orders PostgreSQL RLS", () => {
  beforeAll(async () => {
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-imaging-orders-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE imaging_orders TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE tenants, patients, owners TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `io-rls-a-${tenantAId}`,
          name: "Imaging Orders RLS Tenant A",
          country: "TR",
        },
        {
          id: tenantBId,
          slug: `io-rls-b-${tenantBId}`,
          name: "Imaging Orders RLS Tenant B",
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
    await adminPrisma.imagingOrder.createMany({
      data: [
        {
          id: seededOrderAId,
          tenantId: tenantAId,
          patientId: patientAId,
          imagingTestId: imagingTestAId,
          imagingTestCode: "XR-THX",
          imagingTestName: "Thorax X-Ray (Tenant A)",
          modality: "xray",
          bodyPart: "thorax",
          price: "350.0000",
          sourceType: "manual",
          sourceId: null,
          priority: "routine",
          status: "ordered",
          createdBy: "rls-e2e",
        },
        {
          id: seededOrderBId,
          tenantId: tenantBId,
          patientId: patientBId,
          imagingTestId: imagingTestBId,
          imagingTestCode: "CT-THX",
          imagingTestName: "Thorax CT (Tenant B)",
          modality: "ct",
          bodyPart: "thorax",
          price: "1500.0000",
          sourceType: "manual",
          sourceId: null,
          priority: "urgent",
          status: "scheduled",
          createdBy: "rls-e2e",
        },
      ],
    });
  });

  afterAll(async () => {
    await appPrisma.$disconnect();
    await dropTestRole();
    await adminPrisma.$disconnect();
  });

  it("tenant bağlamı yokken imaging_orders satırı göstermez veya yazdırmaz", async () => {
    await expect(appPrisma.imagingOrder.findMany()).resolves.toEqual([]);
    await expect(
      appPrisma.imagingOrder.create({
        data: {
          tenantId: tenantAId,
          patientId: patientAId,
          imagingTestId: imagingTestAId,
          imagingTestCode: "XR-THX",
          imagingTestName: "Thorax X-Ray (Tenant A)",
          modality: "xray",
          bodyPart: "thorax",
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
      const rows = await tx.imagingOrder.findMany({ orderBy: { id: "asc" } });
      return rows.map((r) => r.id);
    });
    const otherTenantIds = await withTenant(tenantBId, async (tx) => {
      const rows = await tx.imagingOrder.findMany({ orderBy: { id: "asc" } });
      return rows.map((r) => r.id);
    });

    expect(visibleIds).toContain(seededOrderAId);
    expect(visibleIds).not.toContain(seededOrderBId);

    expect(otherTenantIds).toContain(seededOrderBId);
    expect(otherTenantIds).not.toContain(seededOrderAId);
  });

  it("Repository findById tenant-scoped: cross-tenant null döner", async () => {
    const inTenantA = await imagingOrdersRepository.findById(
      tenantAId,
      seededOrderAId,
    );
    const inTenantBWithForeignId = await imagingOrdersRepository.findById(
      tenantBId,
      seededOrderAId,
    );
    const inTenantAWithBOrderId = await imagingOrdersRepository.findById(
      tenantAId,
      seededOrderBId,
    );

    expect(inTenantA?.id).toBe(seededOrderAId);
    expect(inTenantA?.modality).toBe("xray");
    expect(inTenantBWithForeignId).toBeNull();
    expect(inTenantAWithBOrderId).toBeNull();
  });

  it("Repository search tenant-scoped: status filtresi yalnızca kendi tenant'ında çalışır", async () => {
    const aResults = await imagingOrdersRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      status: "ordered",
    });
    const bResults = await imagingOrdersRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
      status: "ordered",
    });
    const bScheduled = await imagingOrdersRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
      status: "scheduled",
    });

    expect(aResults.items.map((r) => r.id)).toEqual([seededOrderAId]);
    expect(aResults.total).toBe(1);
    expect(bResults.items).toEqual([]);
    expect(bResults.total).toBe(0);
    expect(bScheduled.items.map((r) => r.id)).toEqual([seededOrderBId]);
  });

  it("Repository search modality filtresi tenant-scoped", async () => {
    const aXray = await imagingOrdersRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      modality: "xray",
    });
    const aCt = await imagingOrdersRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      modality: "ct",
    });
    const bCt = await imagingOrdersRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
      modality: "ct",
    });

    expect(aXray.items.map((r) => r.id)).toEqual([seededOrderAId]);
    expect(aCt.items).toEqual([]);
    expect(bCt.items.map((r) => r.id)).toEqual([seededOrderBId]);
  });

  it("Repository insert kendi tenant context'inde yeni kayıt ekler", async () => {
    const inserted = await imagingOrdersRepository.insert({
      tenantId: tenantAId,
      patientId: patientAId,
      imagingTestId: imagingTestAId,
      imagingTestCode: "XR-ABD",
      imagingTestName: "Abdomen X-Ray",
      modality: "xray",
      bodyPart: "abdomen",
      price: "300.0000",
      sourceType: "manual",
      sourceId: null,
      priority: "routine",
      createdBy: "rls-e2e",
      notes: "Inserted via RLS test",
    });

    expect(inserted.tenantId).toBe(tenantAId);
    expect(inserted.status).toBe("ordered");
    expect(inserted.imagingTestCode).toBe("XR-ABD");

    const visible = await withTenant(tenantAId, async (tx) =>
      tx.imagingOrder.findUnique({ where: { id: inserted.id } }),
    );
    const invisible = await withTenant(tenantBId, async (tx) =>
      tx.imagingOrder.findUnique({ where: { id: inserted.id } }),
    );

    expect(visible?.id).toBe(inserted.id);
    expect(invisible).toBeNull();
  });

  it("Repository update doğru tenant'ta başarılı", async () => {
    const updated = await imagingOrdersRepository.update(
      tenantAId,
      seededOrderAId,
      { status: "scheduled", scheduledLocation: "X-Ray Room 1" },
    );
    expect(updated?.id).toBe(seededOrderAId);
    expect(updated?.status).toBe("scheduled");
    expect(updated?.scheduledLocation).toBe("X-Ray Room 1");
  });

  it("Repository update cross-tenant: P2025/null ile sonuçlanır", async () => {
    const result = await imagingOrdersRepository.update(
      tenantAId,
      seededOrderBId,
      { status: "cancelled", cancelReason: "cross-tenant probe" },
    );
    expect(result).toBeNull();

    const untouched = await adminPrisma.imagingOrder.findUnique({
      where: { id: seededOrderBId },
    });
    expect(untouched?.status).toBe("scheduled");
    expect(untouched?.cancelReason).toBeNull();
  });

  it("Repository update reportRevisions JSONB kendi tenant'ında günceller", async () => {
    const revisions = [
      {
        revision: 1,
        findings: "Normal thorax",
        impression: "Unremarkable",
        recommendation: null,
        attachments: [],
        enteredBy: "rls-e2e",
        enteredAt: new Date("2026-08-04T12:00:00.000Z").toISOString(),
        amendmentReason: null,
        approved: true,
        approvedBy: "vet-1",
        approvedAt: new Date("2026-08-04T12:30:00.000Z").toISOString(),
        portalVisible: true,
        reviewNotes: null,
      },
    ];

    const updated = await imagingOrdersRepository.update(
      tenantAId,
      seededOrderAId,
      { reportRevisions: revisions, status: "reported" },
    );
    expect(updated?.id).toBe(seededOrderAId);
    expect(updated?.status).toBe("reported");
    expect(updated?.reportRevisions).toHaveLength(1);
    expect(updated?.reportRevisions[0]?.findings).toBe("Normal thorax");
  });

  it("Append-only trigger tenant bağlamı doğru olsa dahi DELETE'i reddeder", async () => {
    await expect(
      withTenant(tenantAId, async (tx) =>
        tx.imagingOrder.delete({ where: { id: seededOrderAId } }),
      ),
    ).rejects.toBeDefined();

    const stillThere = await adminPrisma.imagingOrder.findUnique({
      where: { id: seededOrderAId },
    });
    expect(stillThere?.id).toBe(seededOrderAId);
  });

  it("App role yalnızca imaging_orders SELECT/INSERT/UPDATE yetkisine sahiptir", async () => {
    const privs = await adminPrisma.$queryRawUnsafe<
      Array<{ privilege_type: string }>
    >(`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = '${appRoleName}'
        AND table_name = 'imaging_orders'
      ORDER BY privilege_type;
    `);
    const types = privs.map((p) => p.privilege_type);
    expect(types).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });
});
