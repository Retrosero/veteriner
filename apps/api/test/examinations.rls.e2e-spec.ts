/**
 * @file Examination PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle `examinations` tablosunu doğrular. Tenant bağlamı yokken
 * satır okunamaz veya yazılamaz; doğru bağlam yalnızca ilgili tenant'ın
 * satırlarını açar. Test rolü yalnızca geçici E2E veritabanında oluşturulur.
 *
 * Not: `examinations` tablosunda fiziksel DELETE/UPDATE için append-only
 * trigger yoktur (RLS üzerinden tenant_id izolasyonu sağlanır); klinik
 * düzeltme amendment (`examination_amends`) tablosu üzerinden izlenir.
 * Bu nedenle "append-only DELETE/UPDATE reddi" senaryoları yerine
 * cross-tenant update reddi ve yetki-grant doğrulaması yazılır.
 *
 * DB yoksa (DATABASE_MIGRATOR_URL veya DATABASE_URL tanımsız) tüm
 * senaryolar `itDb.skip` ile geçilir; lint + type-check gate'lerini
 * kırmaz.
 *
 * @since GOAL-017 (FAZ-12) cross-tenant RLS coverage — 5 modül (examination)
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ExaminationsRepository } from "../src/modules/examinations/examinations.repository.js";

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
    "[examinations.rls] DATABASE_MIGRATOR_URL/DATABASE_URL yok; 10 senaryo skip edilecek.",
  );
}

// ---------------------------------------------------------------------------
// Prisma client kurulumu (admin + kısıtlı app rolü).
// ---------------------------------------------------------------------------

const STUB_DATABASE_URL = "postgresql://stub:stub@localhost:5432/stub";

const adminPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl ?? STUB_DATABASE_URL } },
});
const appRoleName = "vetniva_e2e_examinations_app";

const appDatabaseUrl = new URL(runtimeDatabaseUrl ?? STUB_DATABASE_URL);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-examinations-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const examinationsRepository = new ExaminationsRepository(
  appPrisma as unknown as PrismaService,
);

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const ownerAId = randomUUID();
const ownerBId = randomUUID();
const patientAId = randomUUID();
const patientBId = randomUUID();
const vetAId = randomUUID();
const vetBId = randomUUID();
const seededExamAId = `exam-rls-a-${randomUUID().slice(0, 8)}`;
const seededExamBId = `exam-rls-b-${randomUUID().slice(0, 8)}`;
const foreignExamId = `exam-rls-fb-${randomUUID().slice(0, 8)}`;
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

describe("Examination PostgreSQL RLS", () => {
  beforeAll(async () => {
    if (skip) return;
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-examinations-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE examinations, examination_amends TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE tenants, owners, patients, users TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `ex-rls-a-${tenantAId}`,
          name: "Examination RLS Tenant A",
          country: "TR",
        },
        {
          id: tenantBId,
          slug: `ex-rls-b-${tenantBId}`,
          name: "Examination RLS Tenant B",
          country: "TR",
        },
      ],
    });
    await adminPrisma.user.createMany({
      data: [
        {
          id: vetAId,
          email: `vet-a-${vetAId}@vetniva.test`,
          passwordHash: "not-used",
          displayName: "Vet A",
        },
        {
          id: vetBId,
          email: `vet-b-${vetBId}@vetniva.test`,
          passwordHash: "not-used",
          displayName: "Vet B",
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
    await adminPrisma.examination.createMany({
      data: [
        {
          id: seededExamAId,
          tenantId: tenantAId,
          patientId: patientAId,
          veterinarianId: vetAId,
          status: "in_progress",
          type: "general",
          chiefComplaint: "Tenant A routine check",
          startedAt: new Date("2026-08-01T09:00:00.000Z"),
          completedAt: null,
          signedAt: null,
          signedBy: null,
          createdAt: new Date("2026-08-01T09:00:00.000Z"),
          updatedAt: new Date("2026-08-01T09:00:00.000Z"),
        },
        {
          id: seededExamBId,
          tenantId: tenantBId,
          patientId: patientBId,
          veterinarianId: vetBId,
          status: "completed",
          type: "general",
          chiefComplaint: "Tenant B follow-up",
          startedAt: new Date("2026-08-02T10:00:00.000Z"),
          completedAt: new Date("2026-08-02T10:30:00.000Z"),
          signedAt: null,
          signedBy: null,
          createdAt: new Date("2026-08-02T10:00:00.000Z"),
          updatedAt: new Date("2026-08-02T10:30:00.000Z"),
        },
        {
          id: foreignExamId,
          tenantId: tenantBId,
          patientId: patientBId,
          veterinarianId: vetBId,
          status: "draft",
          type: "general",
          chiefComplaint: "Tenant B cross-tenant probe",
          startedAt: new Date("2026-08-03T11:00:00.000Z"),
          completedAt: null,
          signedAt: null,
          signedBy: null,
          createdAt: new Date("2026-08-03T11:00:00.000Z"),
          updatedAt: new Date("2026-08-03T11:00:00.000Z"),
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

  itDb(
    "tenant bağlamı yokken examinations satırı göstermez veya yazdırmaz",
    async () => {
      expect(await appPrisma.examination.findMany()).toEqual([]);
      await expect(
        appPrisma.examination.create({
          data: {
            id: `exam-unauth-${randomUUID().slice(0, 8)}`,
            tenantId: tenantAId,
            patientId: patientAId,
            veterinarianId: vetAId,
            status: "draft",
            type: "general",
            chiefComplaint: "Unauthorized write",
            startedAt: new Date(),
            completedAt: null,
            signedAt: null,
            signedBy: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      ).rejects.toBeDefined();
    },
  );

  itDb("doğru tenant bağlamı yalnızca kendi kaydını açar", async () => {
    const visibleA = await withTenant(tenantAId, async (tx) => {
      const rows = await tx.examination.findMany({ orderBy: { id: "asc" } });
      return rows.map((r) => r.id);
    });
    const visibleB = await withTenant(tenantBId, async (tx) => {
      const rows = await tx.examination.findMany({ orderBy: { id: "asc" } });
      return rows.map((r) => r.id);
    });

    expect(visibleA).toEqual([seededExamAId]);
    expect(visibleB.sort()).toEqual([seededExamBId, foreignExamId].sort());
    expect(visibleA).not.toContain(seededExamBId);
    expect(visibleB).not.toContain(seededExamAId);
  });

  itDb(
    "Repository persistedFind tenant-scoped: cross-tenant null döner",
    async () => {
      const inTenantA = await examinationsRepository.persistedFind(
        tenantAId,
        seededExamAId,
      );
      const inTenantBWithForeignId = await examinationsRepository.persistedFind(
        tenantBId,
        seededExamAId,
      );
      const inTenantAWithBTenantId = await examinationsRepository.persistedFind(
        tenantAId,
        seededExamBId,
      );

      expect(inTenantA?.id).toBe(seededExamAId);
      expect(inTenantBWithForeignId).toBeNull();
      expect(inTenantAWithBTenantId).toBeNull();
    },
  );

  itDb(
    "Repository search tenant-scoped: doğru tenant kendi kayıtlarını sayar",
    async () => {
      const aResults = examinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
      });
      const bResults = examinationsRepository.search(tenantBId, {
        limit: 20,
        offset: 0,
      });

      expect(aResults.items.map((r) => r.id)).toEqual([seededExamAId]);
      expect(aResults.total).toBe(1);
      expect(bResults.items.map((r) => r.id).sort()).toEqual(
        [seededExamBId, foreignExamId].sort(),
      );
      expect(bResults.total).toBe(2);
    },
  );

  itDb(
    "Repository search patientId filtresi cross-tenant izolasyonu korur",
    async () => {
      const aOnBPatient = examinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
        patientId: patientBId,
      });
      const aOnAPatient = examinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
        patientId: patientAId,
      });

      expect(aOnBPatient.items).toEqual([]);
      expect(aOnAPatient.items.map((r) => r.id)).toEqual([seededExamAId]);
    },
  );

  itDb(
    "Repository search status filtresi yalnızca kendi tenant'ında eşleşir",
    async () => {
      const aStatusInProgress = examinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
        status: "in_progress",
      });
      const aStatusCompleted = examinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
        status: "completed",
      });
      const bStatusCompleted = examinationsRepository.search(tenantBId, {
        limit: 20,
        offset: 0,
        status: "completed",
      });

      expect(aStatusInProgress.items.map((r) => r.id)).toEqual([seededExamAId]);
      expect(aStatusCompleted.items).toEqual([]);
      expect(bStatusCompleted.items.map((r) => r.id)).toEqual([seededExamBId]);
    },
  );

  itDb(
    "Repository insert kendi tenant context'inde yeni kayıt ekler",
    async () => {
      const newId = `exam-ins-${randomUUID().slice(0, 8)}`;
      const inserted = await examinationsRepository.persist({
        id: newId,
        tenantId: tenantAId,
        patientId: patientAId,
        veterinarianId: vetAId,
        appointmentId: null,
        status: "in_progress",
        type: "consultation",
        chiefComplaint: "Inserted via RLS test",
        startedAt: new Date().toISOString(),
        completedAt: null,
        signedAt: null,
        signedBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(inserted.tenantId).toBe(tenantAId);
      expect(inserted.id).toBe(newId);
      expect(inserted.chiefComplaint).toBe("Inserted via RLS test");

      const visible = await withTenant(tenantAId, async (tx) =>
        tx.examination.findUnique({ where: { id: newId } }),
      );
      const invisible = await withTenant(tenantBId, async (tx) =>
        tx.examination.findUnique({ where: { id: newId } }),
      );

      expect(visible?.id).toBe(newId);
      expect(invisible).toBeNull();
    },
  );

  itDb("Repository persistedUpdate doğru tenant'ta başarılı", async () => {
    const updated = await examinationsRepository.persistedUpdate(
      tenantAId,
      seededExamAId,
      {
        status: "completed",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    );
    expect(updated?.id).toBe(seededExamAId);
    expect(updated?.status).toBe("completed");
    expect(updated?.completedAt).toBeTruthy();
  });

  itDb(
    "Repository persistedUpdate cross-tenant: null ile sonuçlanır",
    async () => {
      const result = await examinationsRepository.persistedUpdate(
        tenantAId,
        seededExamBId,
        {
          status: "completed",
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      );
      expect(result).toBeNull();

      const untouched = await adminPrisma.examination.findUnique({
        where: { id: seededExamBId },
      });
      expect(untouched?.status).toBe("completed");
      expect(untouched?.completedAt?.toISOString()).toBe(
        "2026-08-02T10:30:00.000Z",
      );
    },
  );

  itDb(
    "App role yalnızca SELECT/INSERT/UPDATE yetkisine sahiptir",
    async () => {
      const privs = await adminPrisma.$queryRawUnsafe<
        Array<{ privilege_type: string; table_name: string }>
      >(`
      SELECT privilege_type, table_name
      FROM information_schema.role_table_grants
      WHERE grantee = '${appRoleName}'
        AND table_name IN ('examinations', 'examination_amends')
      ORDER BY table_name, privilege_type;
    `);
      const examinationsPrivs = privs
        .filter((p) => p.table_name === "examinations")
        .map((p) => p.privilege_type);
      const amendPrivs = privs
        .filter((p) => p.table_name === "examination_amends")
        .map((p) => p.privilege_type);
      expect(examinationsPrivs).toEqual(["INSERT", "SELECT", "UPDATE"]);
      expect(amendPrivs).toEqual(["INSERT", "SELECT", "UPDATE"]);
    },
  );
});
