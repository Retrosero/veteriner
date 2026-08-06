/**
 * @file Patient PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle `patients` tablosunu doğrular. Tenant bağlamı yokken
 * satır okunamaz veya yazılamaz; doğru bağlam yalnızca ilgili tenant'ın
 * satırlarını açar. Test rolü yalnızca geçici E2E veritabanında oluşturulur.
 *
 * Not: `patients` tablosunda fiziksel DELETE için append-only trigger
 * yoktur (RLS üzerinden tenant_id izolasyonu sağlanır); bu nedenle
 * "append-only DELETE reddi" senaryosu yerine cross-tenant updateOwner
 * reddi ve yetki-grant doğrulaması yazılır.
 *
 * DB yoksa (DATABASE_MIGRATOR_URL veya DATABASE_URL tanımsız) tüm
 * senaryolar `itDb.skip` ile geçilir; lint + type-check gate'lerini
 * kırmaz.
 *
 * @since GOAL-017 (FAZ-12) cross-tenant RLS coverage — 5 modül (patient)
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PatientsRepository } from "../src/modules/patients/patients.repository.js";

import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Skip guard — DB yoksa lint/type-check/test gate'lerini kırmadan skip.
// ---------------------------------------------------------------------------

const migratorDatabaseUrl = process.env["DATABASE_MIGRATOR_URL"];
const runtimeDatabaseUrl = process.env["DATABASE_URL"];
const skip = !migratorDatabaseUrl || !runtimeDatabaseUrl;
const itDb = skip ? it.skip : it;

if (skip) {
  console.warn(
    "[patients.rls] DATABASE_MIGRATOR_URL/DATABASE_URL yok; 10 senaryo skip edilecek.",
  );
}

// ---------------------------------------------------------------------------
// Prisma client kurulumu (admin + kısıtlı app rolü).
// ---------------------------------------------------------------------------

// Prisma Client lazy connection kullanır; tanımsız URL bile nesne
// oluşumunu engellemez. `itDb.skip` aktifken sorgu çalışmadığı için
// stub URL güvenli.
const STUB_DATABASE_URL = "postgresql://stub:stub@localhost:5432/stub";

const adminPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl ?? STUB_DATABASE_URL } },
});
const appRoleName = "vetniva_e2e_patients_app";

const appDatabaseUrl = new URL(runtimeDatabaseUrl ?? STUB_DATABASE_URL);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-patients-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const patientsRepository = new PatientsRepository(
  appPrisma as unknown as PrismaService,
);

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const ownerAId = randomUUID();
const ownerBId = randomUUID();
const seededPatientAId = randomUUID();
const seededPatientBId = randomUUID();
const foreignPatientId = randomUUID();
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

describe("Patient PostgreSQL RLS", () => {
  beforeAll(async () => {
    if (skip) return;
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-patients-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE patients TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE owners, tenants TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `pt-rls-a-${tenantAId}`,
          name: "Patient RLS Tenant A",
          country: "TR",
        },
        {
          id: tenantBId,
          slug: `pt-rls-b-${tenantBId}`,
          name: "Patient RLS Tenant B",
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
          phone: `+90555111${randomUUID().slice(0, 4)}`,
        },
        {
          id: ownerBId,
          tenantId: tenantBId,
          firstName: "Owner",
          lastName: "B",
          phone: `+90555222${randomUUID().slice(0, 4)}`,
        },
      ],
    });
    await adminPrisma.patient.createMany({
      data: [
        {
          id: seededPatientAId,
          tenantId: tenantAId,
          ownerId: ownerAId,
          name: "Karabaş",
          species: "dog",
          gender: "female",
          neutered: false,
          microchip: `90011100000000${randomUUID().slice(0, 1)}`.slice(0, 15),
        },
        {
          id: seededPatientBId,
          tenantId: tenantBId,
          ownerId: ownerBId,
          name: "Minnoş",
          species: "cat",
          gender: "male",
          neutered: true,
        },
        {
          id: foreignPatientId,
          tenantId: tenantBId,
          ownerId: ownerBId,
          name: "Foreign Probe",
          species: "bird",
          gender: "unknown",
          neutered: false,
        },
      ],
    });
  });

  afterAll(async () => {
    if (skip) return;
    await appPrisma.$disconnect();
    await dropTestRole();
    await adminPrisma.$disconnect();
  });

  itDb("tenant bağlamı yokken patients satırı göstermez veya yazdırmaz", async () => {
    expect(await appPrisma.patient.findMany()).toEqual([]);
    await expect(
      appPrisma.patient.create({
        data: {
          id: randomUUID(),
          tenantId: tenantAId,
          ownerId: ownerAId,
          name: "Unauthorized write",
          species: "dog",
          gender: "female",
          neutered: false,
        },
      }),
    ).rejects.toBeDefined();
  });

  itDb("doğru tenant bağlamı yalnızca kendi kaydını açar", async () => {
    const visibleA = await withTenant(tenantAId, async (tx) => {
      const rows = await tx.patient.findMany({ orderBy: { name: "asc" } });
      return rows.map((r) => r.id);
    });
    const visibleB = await withTenant(tenantBId, async (tx) => {
      const rows = await tx.patient.findMany({ orderBy: { name: "asc" } });
      return rows.map((r) => r.id);
    });

    expect(visibleA).toEqual([seededPatientAId]);
    expect(visibleB.sort()).toEqual(
      [seededPatientBId, foreignPatientId].sort(),
    );
    expect(visibleA).not.toContain(seededPatientBId);
    expect(visibleB).not.toContain(seededPatientAId);
  });

  itDb("Repository findById tenant-scoped: cross-tenant null döner", async () => {
    const inTenantA = patientsRepository.findById(tenantAId, seededPatientAId);
    const inTenantBWithForeignId = patientsRepository.findById(
      tenantBId,
      seededPatientAId,
    );
    const inTenantAWithBTenantId = patientsRepository.findById(
      tenantAId,
      seededPatientBId,
    );

    expect(inTenantA?.id).toBe(seededPatientAId);
    expect(inTenantBWithForeignId).toBeNull();
    expect(inTenantAWithBTenantId).toBeNull();
  });

  itDb("Repository findByMicrochip tenant-scoped: cross-tenant null döner", async () => {
    const aRow = patientsRepository.findByMicrochip(
      tenantAId,
      "900111000000001",
    );
    const bSeesA = patientsRepository.findByMicrochip(
      tenantBId,
      "900111000000001",
    );

    expect(aRow?.id).toBe(seededPatientAId);
    expect(bSeesA).toBeNull();
  });

  itDb("Repository search tenant-scoped: doğru tenant kendi kayıtlarını sayar", async () => {
    const aResults = patientsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
    });
    const bResults = patientsRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
    });

    expect(aResults.items.map((r) => r.id)).toEqual([seededPatientAId]);
    expect(aResults.total).toBe(1);
    expect(bResults.items.map((r) => r.id).sort()).toEqual(
      [seededPatientBId, foreignPatientId].sort(),
    );
    expect(bResults.total).toBe(2);
  });

  itDb("Repository search search filtresi yalnızca kendi tenant'ında eşleşir", async () => {
    const aResults = patientsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      search: "Karabaş",
    });
    const bResults = patientsRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
      search: "Karabaş",
    });
    const aForeign = patientsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      search: "Minnoş",
    });

    expect(aResults.items.map((r) => r.id)).toEqual([seededPatientAId]);
    expect(bResults.items).toEqual([]);
    expect(aForeign.items).toEqual([]);
  });

  itDb("Repository search ownerId filtresi cross-tenant izolasyonu korur", async () => {
    const bResults = patientsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      ownerId: ownerBId,
    });
    const aResults = patientsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      ownerId: ownerAId,
    });

    expect(bResults.items).toEqual([]);
    expect(aResults.items.map((r) => r.id)).toEqual([seededPatientAId]);
  });

  itDb("Repository insert kendi tenant context'inde yeni kayıt ekler", async () => {
    const newId = randomUUID();
    const inserted = await patientsRepository.persist({
      id: newId,
      tenantId: tenantAId,
      ownerId: ownerAId,
      name: "Inserted via RLS test",
      species: "dog",
      breed: null,
      birthDate: null,
      gender: "male",
      microchip: `90011100000009${randomUUID().slice(0, 1)}`.slice(0, 15),
      color: null,
      neutered: true,
      notes: null,
      createdAt: new Date().toISOString(),
      archivedAt: null,
    });

    expect(inserted.tenantId).toBe(tenantAId);
    expect(inserted.id).toBe(newId);
    expect(inserted.name).toBe("Inserted via RLS test");

    const visible = await withTenant(tenantAId, async (tx) =>
      tx.patient.findUnique({ where: { id: newId } }),
    );
    const invisible = await withTenant(tenantBId, async (tx) =>
      tx.patient.findUnique({ where: { id: newId } }),
    );

    expect(visible?.id).toBe(newId);
    expect(invisible).toBeNull();
  });

  itDb("Repository updateOwner doğru tenant'ta başarılı", async () => {
    const newOwnerId = randomUUID();
    await adminPrisma.owner.create({
      data: {
        id: newOwnerId,
        tenantId: tenantAId,
        firstName: "NewOwner",
        lastName: "TenantA",
        phone: `+90555333${randomUUID().slice(0, 4)}`,
      },
    });

    const updated = patientsRepository.updateOwner(
      tenantAId,
      seededPatientAId,
      newOwnerId,
    );

    expect(updated?.id).toBe(seededPatientAId);
    expect(updated?.ownerId).toBe(newOwnerId);

    const persisted = await adminPrisma.patient.findUnique({
      where: { id: seededPatientAId },
    });
    expect(persisted?.ownerId).toBe(newOwnerId);
  });

  itDb("Repository updateOwner cross-tenant: P2025/null ile sonuçlanır", async () => {
    const result = patientsRepository.updateOwner(
      tenantAId,
      seededPatientBId,
      ownerAId,
    );
    expect(result).toBeNull();

    const untouched = await adminPrisma.patient.findUnique({
      where: { id: seededPatientBId },
    });
    expect(untouched?.ownerId).toBe(ownerBId);
  });

  itDb("App role yalnızca SELECT/INSERT/UPDATE yetkisine sahiptir", async () => {
    const privs = await adminPrisma.$queryRawUnsafe<
      Array<{ privilege_type: string }>
    >(`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = '${appRoleName}'
        AND table_name = 'patients'
      ORDER BY privilege_type;
    `);
    const types = privs.map((p) => p.privilege_type);
    expect(types).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });
});
