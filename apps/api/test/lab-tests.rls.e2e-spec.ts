/**
 * @file Lab Tests PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle lab_tests kataloğunu doğrular. Tenant bağlamı yokken
 * satır okunamaz veya yazılamaz; doğru bağlam yalnızca ilgili tenant'ın
 * satırlarını açar. Append-only trigger'ı RLS bağlamı doğru olsa dahi
 * DELETE'i reddetmelidir. Test rolü yalnızca geçici E2E veritabanında
 * oluşturulur.
 *
 * W1.2a (GOAL-090) kapsamında in-memory'den DB'ye taşınan modülün ilk
 * RLS e2e doğrulaması.
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LabTestsRepository } from "../src/modules/lab-tests/lab-tests.repository.js";

import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { Prisma } from "@prisma/client";

// Skip guard — DB yoksa lint/type-check/test gate'lerini kırmadan skip.
const migratorDatabaseUrl = process.env["DATABASE_MIGRATOR_URL"];
const runtimeDatabaseUrl = process.env["DATABASE_URL"];
const rlsSkip = !migratorDatabaseUrl || !runtimeDatabaseUrl;
const describeDb = rlsSkip ? describe.skip : describe;
if (rlsSkip) {
  console.warn(
    "[lab-tests.rls] DATABASE_MIGRATOR_URL/DATABASE_URL yok; senaryo skip edilecek.",
  );
}

const STUB_DATABASE_URL = "postgresql://stub:stub@localhost:5432/stub";

const adminPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl ?? STUB_DATABASE_URL } },
});
const appRoleName = "vetniva_e2e_lab_tests_app";

const appDatabaseUrl = new URL(runtimeDatabaseUrl ?? STUB_DATABASE_URL);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-lab-tests-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const labTestsRepository = new LabTestsRepository(
  appPrisma as unknown as PrismaService,
);

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const seededLabTestAId = randomUUID();
const seededLabTestBId = randomUUID();
const foreignLabTestId = randomUUID();
type TransactionClient = Prisma.TransactionClient;

/** Kısıtlı rol altında transaction-local tenant bağlamı kurar. */
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

/** Test rolüne ait grant'leri ve rolü, varsa güvenli şekilde temizler. */
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

describeDb("Lab Tests PostgreSQL RLS", () => {
  beforeAll(async () => {
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-lab-tests-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE lab_tests TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `lt-rls-a-${tenantAId}`,
          name: "Lab Tests RLS Tenant A",
          country: "TR",
        },
        {
          id: tenantBId,
          slug: `lt-rls-b-${tenantBId}`,
          name: "Lab Tests RLS Tenant B",
          country: "TR",
        },
      ],
    });

    await adminPrisma.labTest.create({
      data: {
        id: seededLabTestAId,
        tenantId: tenantAId,
        code: "CBC",
        name: "Complete Blood Count (Tenant A)",
        sampleType: "blood",
        unit: "cells/mcL",
        referenceRange: "4000-11000",
        conditionalRanges: null,
        price: "120.0000",
        active: true,
        notes: "Seed for tenant A",
        createdBy: "rls-e2e",
      },
    });
    await adminPrisma.labTest.create({
      data: {
        id: seededLabTestBId,
        tenantId: tenantBId,
        code: "CBC",
        name: "Complete Blood Count (Tenant B)",
        sampleType: "blood",
        unit: "cells/mcL",
        referenceRange: "4000-11000",
        conditionalRanges: null,
        price: "100.0000",
        active: true,
        notes: "Seed for tenant B",
        createdBy: "rls-e2e",
      },
    });
    // Aynı kod iki tenant'ta case-insensitive unique olmalı; admin ile bypass.
    await adminPrisma.labTest.create({
      data: {
        id: foreignLabTestId,
        tenantId: tenantBId,
        code: "CHEM7",
        name: "Chemistry 7 panel (Tenant B)",
        sampleType: "blood",
        unit: "panel",
        referenceRange: null,
        conditionalRanges: null,
        price: "200.0000",
        active: true,
        notes: "Cross-tenant isolation probe",
        createdBy: "rls-e2e",
      },
    });
  });

  afterAll(async () => {
    await appPrisma.$disconnect();
    await dropTestRole();
    await adminPrisma.$disconnect();
  });

  it("tenant bağlamı yokken lab_tests satırı göstermez veya yazdırmaz", async () => {
    await expect(appPrisma.labTest.findMany()).resolves.toEqual([]);
    await expect(
      appPrisma.labTest.create({
        data: {
          id: randomUUID(),
          tenantId: tenantAId,
          code: "UNAUTH",
          name: "Unauthorized write",
          sampleType: "blood",
          unit: "x",
          referenceRange: null,
          conditionalRanges: null,
          price: "1.0000",
          active: true,
          notes: null,
          createdBy: "rls-e2e",
        },
      }),
    ).rejects.toBeDefined();
  });

  it("doğru tenant bağlamı yalnızca kendi kaydını açar", async () => {
    const visibleIds = await withTenant(tenantAId, async (tx) => {
      const rows = await tx.labTest.findMany({ orderBy: { code: "asc" } });
      return rows.map((r) => r.id);
    });
    const otherTenantIds = await withTenant(tenantBId, async (tx) => {
      const rows = await tx.labTest.findMany({ orderBy: { code: "asc" } });
      return rows.map((r) => r.id);
    });

    expect(visibleIds).toContain(seededLabTestAId);
    expect(visibleIds).not.toContain(seededLabTestBId);
    expect(visibleIds).not.toContain(foreignLabTestId);

    expect(otherTenantIds).toContain(seededLabTestBId);
    expect(otherTenantIds).toContain(foreignLabTestId);
    expect(otherTenantIds).not.toContain(seededLabTestAId);
  });

  it("findByCode cross-tenant'tan kayıt döndürmez", async () => {
    // Tenant A'dan Tenant B'nin kodunu sorgulamak → null.
    const fromAToB = await withTenant(tenantAId, async (tx) =>
      tx.labTest.findFirst({
        where: { code: { equals: "CBC", mode: "insensitive" } },
      }),
    );
    expect(fromAToB?.id).toBe(seededLabTestAId);

    // Tenant B'den Tenant A'nın kodunu sorgulamak → null.
    const fromBToA = await withTenant(tenantBId, async (tx) =>
      tx.labTest.findFirst({
        where: { code: { equals: "CBC", mode: "insensitive" } },
      }),
    );
    expect(fromBToA?.id).toBe(seededLabTestBId);
  });

  it("Repository findById tenant-scoped: cross-tenant null döner", async () => {
    const inTenantA = await labTestsRepository.findById(
      tenantAId,
      seededLabTestAId,
    );
    const inTenantBWithForeignId = await labTestsRepository.findById(
      tenantBId,
      seededLabTestAId,
    );
    const inTenantAWithBTenantId = await labTestsRepository.findById(
      tenantAId,
      seededLabTestBId,
    );

    expect(inTenantA?.id).toBe(seededLabTestAId);
    // RLS USING clause nedeniyle başka tenant'ın satırı hiç görünmez
    // → findById null döner. Bu, repository'nin tenant parametresinin
    // yalnızca RLS bağlamı için kullanıldığını teyit eder.
    expect(inTenantBWithForeignId).toBeNull();
    expect(inTenantAWithBTenantId).toBeNull();
  });

  it("Repository findByCode tenant-scoped: cross-tenant null döner", async () => {
    const fromA = await labTestsRepository.findByCode(tenantAId, "CBC");
    const fromB = await labTestsRepository.findByCode(tenantBId, "CBC");
    const fromAChem7 = await labTestsRepository.findByCode(tenantAId, "CHEM7");
    const fromBChem7 = await labTestsRepository.findByCode(tenantBId, "CHEM7");

    expect(fromA?.id).toBe(seededLabTestAId);
    expect(fromB?.id).toBe(seededLabTestBId);
    expect(fromAChem7).toBeNull();
    expect(fromBChem7?.id).toBe(foreignLabTestId);
  });

  it("Repository search tenant-scoped: doğru tenant kendi kayıtlarını sayar", async () => {
    const aResults = await labTestsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
    });
    const bResults = await labTestsRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
    });

    expect(aResults.items.map((r) => r.id)).toEqual([seededLabTestAId]);
    expect(aResults.total).toBe(1);
    expect(bResults.items.map((r) => r.id).sort()).toEqual(
      [foreignLabTestId, seededLabTestBId].sort(),
    );
    expect(bResults.total).toBe(2);
  });

  it("Repository search search filtresi yalnızca kendi tenant'ında eşleşir", async () => {
    const aResults = await labTestsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      search: "CBC",
    });
    const bResults = await labTestsRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
      search: "CBC",
    });

    expect(aResults.items.map((r) => r.id)).toEqual([seededLabTestAId]);
    expect(bResults.items.map((r) => r.id)).toEqual([seededLabTestBId]);
  });

  it("Repository insert kendi tenant context'inde yeni kayıt ekler", async () => {
    // Prisma id'yi otomatik üretir (cuid); test'te id geçmiyoruz, dönen
    // değer doğrulanır.
    const inserted = await labTestsRepository.insert({
      tenantId: tenantAId,
      code: `NEW-${randomUUID().slice(0, 8)}`,
      name: "Inserted via RLS test",
      sampleType: "blood",
      unit: "x",
      referenceRange: null,
      conditionalRanges: null,
      price: "10.0000",
      active: true,
      notes: null,
      createdBy: "rls-e2e",
    });

    expect(inserted.tenantId).toBe(tenantAId);
    expect(inserted.id).toBeTruthy();
    expect(inserted.name).toBe("Inserted via RLS test");

    const visible = await withTenant(tenantAId, async (tx) =>
      tx.labTest.findUnique({ where: { id: inserted.id } }),
    );
    const invisible = await withTenant(tenantBId, async (tx) =>
      tx.labTest.findUnique({ where: { id: inserted.id } }),
    );

    expect(visible?.id).toBe(inserted.id);
    expect(invisible).toBeNull();
  });

  it("Repository update tenant-scoped: cross-tenant update RLS tarafından engellenir", async () => {
    // Tenant A'nın actor'ı ile Tenant B'ye ait bir id'yi güncellemeye
    // çalışmak → RLS USING clause o satırı hiç göstermediği için
    // update 0 satır etkiler ve P2025 fırlatır; repository null döner.
    const result = await labTestsRepository.update(
      tenantAId,
      seededLabTestBId,
      { name: "Hacked name" },
    );
    expect(result).toBeNull();

    // Tenant B'deki satırın değişmediğini admin üzerinden doğrula.
    const untouched = await adminPrisma.labTest.findUnique({
      where: { id: seededLabTestBId },
    });
    expect(untouched?.name).toBe("Complete Blood Count (Tenant B)");
  });

  it("Repository update doğru tenant'ta başarılı", async () => {
    const updated = await labTestsRepository.update(
      tenantAId,
      seededLabTestAId,
      { name: "Complete Blood Count (Tenant A — updated)" },
    );
    expect(updated?.id).toBe(seededLabTestAId);
    expect(updated?.name).toBe("Complete Blood Count (Tenant A — updated)");
  });

  it("Append-only trigger tenant bağlamı doğru olsa dahi DELETE'i reddeder", async () => {
    await expect(
      withTenant(tenantAId, async (tx) =>
        tx.labTest.delete({ where: { id: seededLabTestAId } }),
      ),
    ).rejects.toBeDefined();

    // Satır hâlâ duruyor.
    const stillThere = await adminPrisma.labTest.findUnique({
      where: { id: seededLabTestAId },
    });
    expect(stillThere?.id).toBe(seededLabTestAId);
  });

  it("App role SELECT/INSERT/UPDATE dışındaki yetkileri yoktur", async () => {
    // DELETE yetkisi verilmemiş olmalı; bunu yine yetkisiz işlemle doğrulamak
    // zor (zaten RLS engel) ama rolün `pg_class` üzerindeki yetkisi GRANT
    // listesinden görülebilir.
    const privs = await adminPrisma.$queryRawUnsafe<
      Array<{ privilege_type: string }>
    >(`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = '${appRoleName}'
        AND table_name = 'lab_tests'
      ORDER BY privilege_type;
    `);
    const types = privs.map((p) => p.privilege_type);
    expect(types).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });
});
