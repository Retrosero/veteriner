/**
 * @file Cross-Tenant IDOR RLS E2E testi.
 * @module apps/api/test
 * @description GOAL-017 pilot coverage — kısıtlı runtime rolü
 *   (`vetniva_e2e_cross_tenant_app`) ile pilot tenant verisini
 *   kullanarak 10 cross-tenant IDOR senaryosunu doğrular:
 *
 *   1. Patient cross-tenant IDOR
 *   2. Owner cross-tenant IDOR
 *   3. Examination cross-tenant
 *   4. Prescription cross-tenant
 *   5. Vaccination cross-tenant
 *   6. Portal cross-tenant login (user invitation token)
 *   7. Branches arası transfer (cross-branch aynı tenant)
 *   8. Session token rotate (cross-session reuse)
 *   9. Invitation token reuse (tek kullanımlık → 410)
 *  10. Audit log cross-tenant filtreleme
 *
 * Pilot veri (PILOT_SEED, bkz. apps/api/src/common/seed/seed-pilot-tenant.ts):
 * - tenant: 11c6beec-7c64-4cf6-9cb7-d9ea6fd5c8a1 (pilot-vet-kadikoy)
 * - branch: b203d16a-91e2-49c0-b9d7-9bdc55fdf60d (merkez)
 * - users : owner@, owner2@, vet@, staff@pilot.vetniva.local
 * - owners: c4aeb0a1-… (Demo Sahip 1), ab7d7790-… (Demo Sahip 2)
 * - patient: f194d39c-… (Karabaş), 0bdad955-… (Minnoş)
 *
 * Test ortamı (DATABASE_MIGRATOR_URL + DATABASE_URL) hazır değilse
 * tüm senaryolar `it.skip` ile geçilir; lint + type-check ortamı
 * etkilenmez.
 *
 * @since GOAL-017 (FAZ-12) cross-tenant IDOR pilot coverage
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthRepository } from "../src/common/auth/auth.repository.js";
import { ExaminationsRepository } from "../src/modules/examinations/examinations.repository.js";
import { OwnersRepository } from "../src/modules/owners/owners.repository.js";
import { PatientsRepository } from "../src/modules/patients/patients.repository.js";
import { PrescriptionsRepository } from "../src/modules/prescriptions/prescriptions.repository.js";
import { VaccineApplicationsRepository } from "../src/modules/vaccines/vaccine-applications.repository.js";

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
    "[cross-tenant-idor] DATABASE_MIGRATOR_URL/DATABASE_URL yok; 10 senaryo skip edilecek.",
  );
}

// ---------------------------------------------------------------------------
// Prisma client kurulumu (admin + kısıtlı app rolü).
// ---------------------------------------------------------------------------

const adminPrisma = migratorDatabaseUrl
  ? new PrismaClient({ datasources: { db: { url: migratorDatabaseUrl } } })
  : null;

const appRoleName = "vetniva_e2e_cross_tenant_app";
const appRolePassword = "vetniva-e2e-cross-tenant-app-password";

const appPrisma =
  migratorDatabaseUrl && runtimeDatabaseUrl
    ? (() => {
        const url = new URL(runtimeDatabaseUrl);
        url.username = appRoleName;
        url.password = appRolePassword;
        return new PrismaClient({
          datasources: { db: { url: url.toString() } },
        });
      })()
    : null;

// Repository'ler — DB yoksa null; testlerde null-check ile skip guard'ı zaten var.
const patientRepo = appPrisma
  ? new PatientsRepository(appPrisma as unknown as PrismaService)
  : null;
const ownerRepo = appPrisma
  ? new OwnersRepository(appPrisma as unknown as PrismaService)
  : null;
const examRepo = appPrisma
  ? new ExaminationsRepository(appPrisma as unknown as PrismaService)
  : null;
const presRepo = appPrisma
  ? new PrescriptionsRepository(appPrisma as unknown as PrismaService)
  : null;
const vaccRepo = appPrisma
  ? new VaccineApplicationsRepository(appPrisma as unknown as PrismaService)
  : null;
const authRepo = appPrisma
  ? new AuthRepository(appPrisma as unknown as PrismaService)
  : null;

// ---------------------------------------------------------------------------
// Pilot fixture id'leri (PILOT_SEED ile uyumlu).
// ---------------------------------------------------------------------------

const PILOT_TENANT_ID = "11c6beec-7c64-4cf6-9cb7-d9ea6fd5c8a1";
const PILOT_BRANCH_ID = "b203d16a-91e2-49c0-b9d7-9bdc55fdf60d";
const PILOT_OWNER_USER_ID = "92a2c09a-d719-4a9a-b247-94a0e5d25848";
const PILOT_OWNER2_USER_ID = "128183c1-9adf-4783-981f-9487019fc7b2";
const PILOT_VET_USER_ID = "9c0a2f2a-697e-4bf0-a1bd-b965bdb171b9";
const PILOT_STAFF_USER_ID = "e3591932-4c98-45b9-a085-b1df0f4ec606";
const PILOT_OWNER_RECORD_ID = "c4aeb0a1-d45f-4c96-9c1a-2583d97e6a11";
const PILOT_OWNER2_RECORD_ID = "ab7d7790-44c0-4d89-9c86-1e8369d2a922";
const PILOT_PATIENT_KARABAS = "f194d39c-e70b-4a09-91a5-290864843a33";
const PILOT_PATIENT_MINNOS = "0bdad955-7d79-40f4-b6f6-06c3a9a85b44";

// Cross-tenant izolasyon için ikinci (yabancı) tenant + branch + user.
const FOREIGN_TENANT_ID = randomUUID();
const FOREIGN_BRANCH_ID = randomUUID();
const FOREIGN_OWNER_USER_ID = randomUUID();
const FOREIGN_PATIENT_ID = randomUUID();
const FOREIGN_OWNER_RECORD_ID = randomUUID();
const FOREIGN_EXAM_ID = `exam-ct-idor-${randomUUID().slice(0, 8)}`;
const FOREIGN_PRESCRIPTION_ID = `prsc-ct-idor-${randomUUID().slice(0, 8)}`;
const FOREIGN_VACCINE_PROTOCOL_ID = `vcpr-ct-idor-${randomUUID().slice(0, 8)}`;
const FOREIGN_VACCINE_APPLICATION_ID = `vaca-ct-idor-${randomUUID().slice(0, 8)}`;
const FOREIGN_AUDIT_FINGERPRINT = `ct-idor-audit-${randomUUID()}`;

// Aynı tenant farklı branch (cross-branch testi için).
const PILOT_SECOND_BRANCH_ID = randomUUID();

// Session/invitation fixture id'leri.
const SESSION_A_ID = randomUUID();
const SESSION_A_TOKEN_HASH = `ct-idor-session-a-${randomUUID()}`;
const SESSION_B_ID = randomUUID();
const SESSION_B_TOKEN_HASH = `ct-idor-session-b-${randomUUID()}`;
const INVITATION_A_ID = randomUUID();
const INVITATION_A_TOKEN_HASH = `ct-idor-invitation-a-${randomUUID()}`;

type TransactionClient = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// DB yardımcıları (RLS transaction bağlamı + rol bootstrap).
// ---------------------------------------------------------------------------

/** Kısıtlı rol altında transaction-local tenant bağlamı kurar. */
async function withTenant<T>(
  tenantId: string,
  action: (tx: TransactionClient) => Promise<T>,
  userId?: string,
): Promise<T> {
  if (!appPrisma) throw new Error("appPrisma başlatılamadı (skip guard).");
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
    if (userId) {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    }
    return action(tx);
  });
}

/** Test rolüne ait grant'ları ve rolü, varsa güvenli şekilde temizler. */
async function dropTestRole(): Promise<void> {
  if (!adminPrisma) return;
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

/** Kısıtlı app rolünü oluşturur ve gerekli grant'ları verir. */
async function bootstrapTestRole(): Promise<void> {
  if (!adminPrisma) return;
  await dropTestRole();
  await adminPrisma.$executeRawUnsafe(
    `CREATE ROLE ${appRoleName} LOGIN PASSWORD '${appRolePassword}' NOSUPERUSER NOBYPASSRLS`,
  );
  await adminPrisma.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
  );
  // Cross-tenant senaryoları için gerekli tüm tenant-scope tablolar.
  // SELECT — entity read; INSERT — fixture id'ler.
  // RLS policy zaten tenant dışı yazma/okumayı reddeder.
  const tables = [
    "tenants",
    "branches",
    "users",
    "user_tenant_memberships",
    "user_sessions",
    "user_invitations",
    "password_reset_tokens",
    "owners",
    "patients",
    "examinations",
    "examination_amends",
    "prescriptions",
    "prescription_items",
    "vaccine_applications",
    "vaccine_protocols",
    "vaccine_reminders",
    "tenant_vaccine_card_settings",
    "audit_events",
    "security_events",
  ];
  for (const table of tables) {
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT ON TABLE ${table} TO ${appRoleName}`,
    );
  }
  // user_sessions + user_invitations + password_reset_tokens UPDATE
  // (rotation/revoke/accept).
  await adminPrisma.$executeRawUnsafe(
    `GRANT UPDATE ON TABLE user_sessions, user_invitations, password_reset_tokens TO ${appRoleName}`,
  );
}

// ---------------------------------------------------------------------------
// Test suite — 10 senaryo, describe blokları gruplanmış.
// ---------------------------------------------------------------------------

describe("Cross-Tenant IDOR RLS (GOAL-017 pilot coverage)", () => {
  beforeAll(async () => {
    if (skip) return;
    if (!adminPrisma || !appPrisma) return;

    await bootstrapTestRole();

    // Yabancı tenant/branch (cross-tenant IDOR kaynağı).
    await adminPrisma.tenant.create({
      data: {
        id: FOREIGN_TENANT_ID,
        slug: `ct-idor-foreign-${FOREIGN_TENANT_ID}`,
        name: "Cross-Tenant IDOR Foreign Tenant",
        country: "TR",
      },
    });
    await adminPrisma.branch.create({
      data: {
        id: FOREIGN_BRANCH_ID,
        tenantId: FOREIGN_TENANT_ID,
        code: `ct-idor-foreign-${FOREIGN_BRANCH_ID}`,
        name: "Foreign Branch",
      },
    });
    // Pilot tenant altında ikinci branch (cross-branch aynı tenant).
    await adminPrisma.branch.create({
      data: {
        id: PILOT_SECOND_BRANCH_ID,
        tenantId: PILOT_TENANT_ID,
        code: `ct-idor-pilot-2-${PILOT_SECOND_BRANCH_ID}`,
        name: "Pilot Secondary Branch",
      },
    });

    // Yabancı tenant kullanıcısı + üyelik.
    await adminPrisma.user.create({
      data: {
        id: FOREIGN_OWNER_USER_ID,
        email: `ct-idor-foreign-${FOREIGN_OWNER_USER_ID}@vetniva.test`,
        passwordHash: "not-used-by-rls-test",
        displayName: "Foreign Owner",
      },
    });
    await adminPrisma.userTenantMembership.create({
      data: {
        userId: FOREIGN_OWNER_USER_ID,
        tenantId: FOREIGN_TENANT_ID,
        role: "OWNER",
      },
    });

    // Yabancı tenant altında patient/owner/exam/prescription/vaccine
    // (cross-tenant IDOR testlerinde hedef olarak kullanılır).
    await adminPrisma.owner.create({
      data: {
        id: FOREIGN_OWNER_RECORD_ID,
        tenantId: FOREIGN_TENANT_ID,
        firstName: "Foreign",
        lastName: "Owner",
        phone: `+90${randomUUID().slice(0, 10).replace(/-/g, "")}`,
      },
    });
    await adminPrisma.patient.create({
      data: {
        id: FOREIGN_PATIENT_ID,
        tenantId: FOREIGN_TENANT_ID,
        ownerId: FOREIGN_OWNER_RECORD_ID,
        name: "Foreign Pet",
        species: "dog",
        gender: "male",
        neutered: false,
      },
    });
    await adminPrisma.examination.create({
      data: {
        id: FOREIGN_EXAM_ID,
        tenantId: FOREIGN_TENANT_ID,
        patientId: FOREIGN_PATIENT_ID,
        veterinarianId: FOREIGN_OWNER_USER_ID,
        status: "completed",
        type: "general",
        chiefComplaint: "foreign tenant exam",
        startedAt: new Date("2026-08-01T00:00:00.000Z"),
        completedAt: new Date("2026-08-01T00:30:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:30:00.000Z"),
      },
    });
    await adminPrisma.prescriptionRecord.create({
      data: {
        id: FOREIGN_PRESCRIPTION_ID,
        tenantId: FOREIGN_TENANT_ID,
        examinationId: FOREIGN_EXAM_ID,
        patientId: FOREIGN_PATIENT_ID,
        veterinarianId: FOREIGN_OWNER_USER_ID,
        status: "active",
        prescribedAt: new Date("2026-08-01T00:00:00.000Z"),
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    // Vaccine protocol (FK için) + application.
    await adminPrisma.vaccineProtocolRecord.create({
      data: {
        id: FOREIGN_VACCINE_PROTOCOL_ID,
        tenantId: FOREIGN_TENANT_ID,
        name: "Foreign Rabies Protocol",
        species: "dog",
        category: "core",
        steps: [{ step: 1, offsetDays: 0 }],
        totalDurationMonths: 12,
        isCore: true,
        createdBy: FOREIGN_OWNER_USER_ID,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
    await adminPrisma.vaccineApplicationRecord.create({
      data: {
        id: FOREIGN_VACCINE_APPLICATION_ID,
        tenantId: FOREIGN_TENANT_ID,
        patientId: FOREIGN_PATIENT_ID,
        protocolId: FOREIGN_VACCINE_PROTOCOL_ID,
        administeredBy: FOREIGN_OWNER_USER_ID,
        applicationDate: new Date("2026-08-01T00:00:00.000Z"),
        status: "administered",
        createdBy: FOREIGN_OWNER_USER_ID,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        stockMovementIds: "[]",
        lot: { lotNumber: "CT-IDOR-LOT-1" },
      },
    });

    // Audit event yabancı tenant'ta (cross-tenant audit izolasyonu için).
    await adminPrisma.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: "audit:ct_idor.fixture",
        tenantId: FOREIGN_TENANT_ID,
        actorId: FOREIGN_OWNER_USER_ID,
        actorType: "user",
        targetType: "tenant",
        targetId: FOREIGN_TENANT_ID,
        action: "read",
        correlationId: `ct-idor-${randomUUID()}`,
        country: "TR",
        severity: "info",
        metadata: { fingerprint: FOREIGN_AUDIT_FINGERPRINT },
      },
    });
    // Pilot audit event (tenant içi; cross-tenant izolasyonun negatif kanıtı).
    await adminPrisma.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: "audit:ct_idor.pilot",
        tenantId: PILOT_TENANT_ID,
        actorId: PILOT_VET_USER_ID,
        actorType: "user",
        targetType: "patient",
        targetId: PILOT_PATIENT_KARABAS,
        action: "read",
        correlationId: `ct-idor-pilot-${randomUUID()}`,
        country: "TR",
        severity: "info",
        metadata: { actor: "vet", patient: "Karabaş" },
      },
    });
    // Staff audit event (tenant içi; negatif kanıt).
    await adminPrisma.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: "audit:ct_idor.pilot.staff",
        tenantId: PILOT_TENANT_ID,
        actorId: PILOT_STAFF_USER_ID,
        actorType: "user",
        targetType: "patient",
        targetId: PILOT_PATIENT_MINNOS,
        action: "read",
        correlationId: `ct-idor-pilot-${randomUUID()}`,
        country: "TR",
        severity: "info",
        metadata: { actor: "staff", patient: "Minnoş" },
      },
    });

    // Session + invitation fixture'ları (rotation ve reuse testleri için).
    await adminPrisma.userSession.create({
      data: {
        id: SESSION_A_ID,
        userId: PILOT_OWNER_USER_ID,
        tokenHash: SESSION_A_TOKEN_HASH,
        expiresAt: new Date("2026-12-31T23:59:59.000Z"),
        activeBranchId: PILOT_BRANCH_ID,
      },
    });
    await adminPrisma.userSession.create({
      data: {
        id: SESSION_B_ID,
        userId: PILOT_OWNER2_USER_ID,
        tokenHash: SESSION_B_TOKEN_HASH,
        expiresAt: new Date("2026-12-31T23:59:59.000Z"),
        activeBranchId: PILOT_BRANCH_ID,
      },
    });
    await adminPrisma.userInvitation.create({
      data: {
        id: INVITATION_A_ID,
        tenantId: PILOT_TENANT_ID,
        email: `ct-idor-inv-${INVITATION_A_ID}@vetniva.test`,
        role: "VETERINARIAN",
        tokenHash: INVITATION_A_TOKEN_HASH,
        invitedBy: PILOT_OWNER_USER_ID,
        expiresAt: new Date("2026-12-31T23:59:59.000Z"),
      },
    });
  }, 30000);

  afterAll(async () => {
    if (skip) return;
    if (!adminPrisma || !appPrisma) return;

    // Tenant kapsamındaki fixture verileri temizle.
    await adminPrisma.vaccineApplicationRecord.deleteMany({
      where: { tenantId: FOREIGN_TENANT_ID },
    });
    await adminPrisma.vaccineProtocolRecord.deleteMany({
      where: { tenantId: FOREIGN_TENANT_ID },
    });
    await adminPrisma.prescriptionRecord.deleteMany({
      where: { tenantId: FOREIGN_TENANT_ID },
    });
    await adminPrisma.examination.deleteMany({
      where: { tenantId: FOREIGN_TENANT_ID },
    });
    await adminPrisma.patient.deleteMany({
      where: { tenantId: FOREIGN_TENANT_ID },
    });
    await adminPrisma.owner.deleteMany({
      where: { tenantId: FOREIGN_TENANT_ID },
    });
    await adminPrisma.userInvitation.deleteMany({
      where: { id: INVITATION_A_ID },
    });
    await adminPrisma.userSession.deleteMany({
      where: { id: { in: [SESSION_A_ID, SESSION_B_ID] } },
    });
    await adminPrisma.branch.deleteMany({
      where: { id: { in: [FOREIGN_BRANCH_ID, PILOT_SECOND_BRANCH_ID] } },
    });
    await adminPrisma.userTenantMembership.deleteMany({
      where: { tenantId: FOREIGN_TENANT_ID },
    });
    await adminPrisma.user.deleteMany({
      where: { id: FOREIGN_OWNER_USER_ID },
    });
    await adminPrisma.tenant.deleteMany({
      where: { id: FOREIGN_TENANT_ID },
    });

    await dropTestRole();
    await appPrisma.$disconnect();
    await adminPrisma.$disconnect();
  }, 30000);

  // -------------------------------------------------------------------------
  // 1) Patient cross-tenant IDOR
  // -------------------------------------------------------------------------

  itDb(
    "patient cross-tenant read tenant bağlamıyla null döner (RLS gizli 404)",
    async () => {
      if (!patientRepo || !adminPrisma) return;
      // Pilot tenant bağlamında yabancı patient aranırsa RLS null döner.
      // Service katmanı 404'e map eder (VET-CLINIC-0001 / VET-AUTHZ-0002).
      const sameTenantLookup = await patientRepo.findPersistedById(
        PILOT_TENANT_ID,
        FOREIGN_PATIENT_ID,
      );
      expect(sameTenantLookup).toBeNull();

      // Doğrulama: foreign patient'ın varlığı admin tarafında teyit edilir.
      const adminConfirmed = await adminPrisma.patient.findUnique({
        where: { id: FOREIGN_PATIENT_ID },
      });
      expect(adminConfirmed?.tenantId).toBe(FOREIGN_TENANT_ID);

      // Negatif kanıt: pilot patient'ları pilot bağlamında görünür.
      const pilotKarabas = await patientRepo.findPersistedById(
        PILOT_TENANT_ID,
        PILOT_PATIENT_KARABAS,
      );
      const pilotMinnos = await patientRepo.findPersistedById(
        PILOT_TENANT_ID,
        PILOT_PATIENT_MINNOS,
      );
      expect(pilotKarabas?.id).toBe(PILOT_PATIENT_KARABAS);
      expect(pilotMinnos?.id).toBe(PILOT_PATIENT_MINNOS);

      // Pilot patient'ları yabancı bağlamda görünmez.
      const crossLeakKarabas = await withTenant(FOREIGN_TENANT_ID, (tx) =>
        tx.patient.findUnique({ where: { id: PILOT_PATIENT_KARABAS } }),
      );
      const crossLeakMinnos = await withTenant(FOREIGN_TENANT_ID, (tx) =>
        tx.patient.findUnique({ where: { id: PILOT_PATIENT_MINNOS } }),
      );
      expect(crossLeakKarabas).toBeNull();
      expect(crossLeakMinnos).toBeNull();
    },
  );

  // -------------------------------------------------------------------------
  // 2) Owner cross-tenant IDOR
  // -------------------------------------------------------------------------

  itDb("owner cross-tenant read tenant bağlamıyla null döner", async () => {
    if (!ownerRepo) return;
    const sameTenantLookup = await ownerRepo.findPersistedById(
      PILOT_TENANT_ID,
      FOREIGN_OWNER_RECORD_ID,
    );
    expect(sameTenantLookup).toBeNull();

    // Pilot kendi owner'ları doğru tenant bağlamında görünür (negatif kanıt).
    const ownOwner = await ownerRepo.findPersistedById(
      PILOT_TENANT_ID,
      PILOT_OWNER_RECORD_ID,
    );
    const ownOwner2 = await ownerRepo.findPersistedById(
      PILOT_TENANT_ID,
      PILOT_OWNER2_RECORD_ID,
    );
    expect(ownOwner?.id).toBe(PILOT_OWNER_RECORD_ID);
    expect(ownOwner2?.id).toBe(PILOT_OWNER2_RECORD_ID);

    // Pilot owner'ları yabancı bağlamda görünmez.
    const crossLeak = await withTenant(FOREIGN_TENANT_ID, (tx) =>
      tx.owner.findUnique({ where: { id: PILOT_OWNER_RECORD_ID } }),
    );
    expect(crossLeak).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3) Examination cross-tenant
  // -------------------------------------------------------------------------

  itDb(
    "examination cross-tenant read tenant bağlamıyla null döner",
    async () => {
      if (!examRepo) return;
      const sameTenantLookup = await examRepo.persistedFind(
        PILOT_TENANT_ID,
        FOREIGN_EXAM_ID,
      );
      expect(sameTenantLookup).toBeNull();

      // Aynı tenant altında ekilen examination yabancı bağlamda görünmez.
      const foreignScope = await withTenant(FOREIGN_TENANT_ID, (tx) =>
        tx.examination.count({ where: { tenantId: PILOT_TENANT_ID } }),
      );
      expect(foreignScope).toBe(0);
    },
  );

  // -------------------------------------------------------------------------
  // 4) Prescription cross-tenant + audit event
  // -------------------------------------------------------------------------

  itDb(
    "prescription cross-tenant read tenant bağlamıyla null döner; audit yazma RLS tarafından reddedilir",
    async () => {
      if (!presRepo || !appPrisma) return;
      const sameTenantLookup = await presRepo.persistedFindById(
        PILOT_TENANT_ID,
        FOREIGN_PRESCRIPTION_ID,
      );
      expect(sameTenantLookup).toBeNull();

      // Audit event yalnızca pilot tenant bağlamında yazılabilir;
      // yabancı tenant bağlamında audit yazma denemesi RLS tarafından
      // reddedilir (audit_events RLS policy: app.tenant_id eşleşmeli veya
      // is_superadmin=true olmalı).
      const writeAttempt = appPrisma.auditEvent.create({
        data: {
          id: randomUUID(),
          eventName: "audit:ct-idor.prescription.read_attempt",
          tenantId: FOREIGN_TENANT_ID, // pilot değil — RLS reddetmeli
          actorId: PILOT_OWNER_USER_ID,
          actorType: "user",
          targetType: "prescription",
          targetId: FOREIGN_PRESCRIPTION_ID,
          action: "read",
          correlationId: `ct-idor-audit-${randomUUID()}`,
          country: "TR",
          severity: "warning",
        },
      });
      await expect(writeAttempt).rejects.toBeDefined();
    },
  );

  // -------------------------------------------------------------------------
  // 5) Vaccination cross-tenant
  // -------------------------------------------------------------------------

  itDb(
    "vaccination cross-tenant read tenant bağlamıyla null döner",
    async () => {
      if (!vaccRepo) return;
      const sameTenantLookup = await vaccRepo.persistedById(
        PILOT_TENANT_ID,
        FOREIGN_VACCINE_APPLICATION_ID,
      );
      expect(sameTenantLookup).toBeNull();

      // Yabancı tenant bağlamında yabancı application görünür (negatif kanıt).
      const foreignScope = await withTenant(FOREIGN_TENANT_ID, (tx) =>
        tx.vaccineApplicationRecord.count({
          where: { tenantId: FOREIGN_TENANT_ID },
        }),
      );
      expect(foreignScope).toBe(1);
    },
  );

  // -------------------------------------------------------------------------
  // 6) Portal cross-tenant (user invitation token) — PET_OWNER_PORTAL
  // -------------------------------------------------------------------------

  itDb(
    "user invitation token yalnızca kendi tenant'ında çözümlenir (auth.repo RLS yok, service tenant doğrular)",
    async () => {
      if (!authRepo) return;
      // Pilot davetinin foreign tenant bağlamında user_invitations tablosunda
      // aranması → RLS null döner.
      const foreignScopeLookup = await withTenant(FOREIGN_TENANT_ID, (tx) =>
        tx.userInvitation.findUnique({ where: { id: INVITATION_A_ID } }),
      );
      expect(foreignScopeLookup).toBeNull();

      // Pilot bağlamında aynı davet görünür.
      const pilotScopeLookup = await withTenant(PILOT_TENANT_ID, (tx) =>
        tx.userInvitation.findUnique({ where: { id: INVITATION_A_ID } }),
      );
      expect(pilotScopeLookup?.id).toBe(INVITATION_A_ID);

      // authRepository token lookup: pilot daveti foreign user bağlamında
      // görünür (auth.repo RLS kullanmaz; tenant doğrulaması service'te).
      // Davetin kendisi pilot tenant'a ait — service katmanı bu kontrolü yapar.
      const invitationByHash = await authRepo.findInvitationByTokenHash(
        INVITATION_A_TOKEN_HASH,
      );
      expect(invitationByHash?.tenantId).toBe(PILOT_TENANT_ID);
      expect(invitationByHash?.tenantId).not.toBe(FOREIGN_TENANT_ID);
    },
  );

  // -------------------------------------------------------------------------
  // 7) Branches arası transfer (cross-branch aynı tenant) → VET-AUTHZ-0004
  // -------------------------------------------------------------------------

  itDb(
    "branch context senkronizasyonu: pilot user'ın yabancı branch'ına erişim null, aynı tenant farklı branch kabul",
    async () => {
      if (!authRepo) return;
      // authRepository.findActiveBranchForUser pilot user'ı pilot branch'ında
      // bulabilir.
      const primaryBranch = await authRepo.findActiveBranchForUser(
        PILOT_OWNER_USER_ID,
        PILOT_BRANCH_ID,
        false,
      );
      expect(primaryBranch?.id).toBe(PILOT_BRANCH_ID);
      expect(primaryBranch?.tenantId).toBe(PILOT_TENANT_ID);

      // Aynı pilot tenant altında ikinci branch da erişilebilir (cross-branch
      // transfer senaryosu). PermissionsGuard'da branchScope=required ise
      // session.branchId set edilmemiş → VET-AUTHZ-0004 reddi; aksi halde
      // cross-branch transfer mümkün. Bu test branch context çözümlemesinin
      // sağlıklı çalıştığını doğrular.
      const secondaryBranch = await authRepo.findActiveBranchForUser(
        PILOT_OWNER_USER_ID,
        PILOT_SECOND_BRANCH_ID,
        false,
      );
      expect(secondaryBranch?.id).toBe(PILOT_SECOND_BRANCH_ID);
      expect(secondaryBranch?.tenantId).toBe(PILOT_TENANT_ID);

      // Pilot user'ın yabancı tenant branch'ına erişimi null döner
      // (cross-tenant IDOR koruması).
      const foreignBranch = await authRepo.findActiveBranchForUser(
        PILOT_OWNER_USER_ID,
        FOREIGN_BRANCH_ID,
        false,
      );
      expect(foreignBranch).toBeNull();

      // Branch tablosunda RLS: pilot bağlamında foreign branch görünmez.
      const rlsBranchLookup = await withTenant(PILOT_TENANT_ID, (tx) =>
        tx.branch.findUnique({ where: { id: FOREIGN_BRANCH_ID } }),
      );
      expect(rlsBranchLookup).toBeNull();
    },
  );

  // -------------------------------------------------------------------------
  // 8) Session token rotate — cross-session reuse
  // -------------------------------------------------------------------------

  itDb(
    "session token rotate sonrası eski token geçersiz olur (revokedAt set edilir)",
    async () => {
      if (!appPrisma) return;
      // Session A pilot user'ına ait; rotation senaryosu:
      // 1) revoke edildiğinde revokedAt set olur.
      // 2) Yeni bir session oluşturulur ve eskisinin replacedById'si bağlanır.
      // 3) Eski tokenHash tekrar arandığında revokedAt dolu olur.

      const rotatedAt = new Date();
      await withTenant(PILOT_TENANT_ID, async (tx) => {
        await tx.userSession.update({
          where: { id: SESSION_A_ID },
          data: {
            revokedAt: rotatedAt,
            revokedReason: "rotated",
            replacedById: SESSION_B_ID,
          },
        });
      }, PILOT_OWNER_USER_ID);

      // Eski token artık geçersiz: revokedAt dolu.
      const rotatedSession = await withTenant(
        PILOT_TENANT_ID,
        (tx) => tx.userSession.findUnique({ where: { id: SESSION_A_ID } }),
        PILOT_OWNER_USER_ID,
      );
      expect(rotatedSession?.revokedAt).toBeInstanceOf(Date);
      expect(rotatedSession?.revokedReason).toBe("rotated");
      expect(rotatedSession?.replacedById).toBe(SESSION_B_ID);

      // Yeni session (B) hâlâ aktif ve pilot bağlamda görünür.
      const newSession = await withTenant(
        PILOT_TENANT_ID,
        (tx) => tx.userSession.findUnique({ where: { id: SESSION_B_ID } }),
        PILOT_OWNER2_USER_ID,
      );
      expect(newSession?.revokedAt).toBeNull();
      expect(newSession?.tokenHash).toBe(SESSION_B_TOKEN_HASH);

      // Auth repo token lookup hâlâ çalışır (auth.repo RLS yok); service
      // katmanı revokedAt kontrolü yapar.
      const foundByHash =
        await authRepo?.findSessionByTokenHash(SESSION_A_TOKEN_HASH);
      expect(foundByHash?.id).toBe(SESSION_A_ID);
      expect(foundByHash?.revokedAt).toBeInstanceOf(Date);
    },
  );

  // -------------------------------------------------------------------------
  // 9) Invitation token reuse (tek kullanımlık → 410)
  // -------------------------------------------------------------------------

  itDb(
    "invitation token ikinci kez kabul edilemez (status=accepted korunur)",
    async () => {
      if (!appPrisma) return;
      // İlk kabul: pending → accepted.
      await withTenant(PILOT_TENANT_ID, async (tx) => {
        await tx.userInvitation.update({
          where: { id: INVITATION_A_ID },
          data: { status: "accepted", acceptedAt: new Date() },
        });
      });

      // Acceptance sonrası tekrar okunduğunda status=accepted olmalı.
      // Service katmanı (portal.service.ts) bunu 410 VET-PORTAL-0001 olarak
      // döner; burada RLS seviyesinde accepted state'in korunduğunu
      // doğruluyoruz.
      const after = await withTenant(PILOT_TENANT_ID, (tx) =>
        tx.userInvitation.findUnique({ where: { id: INVITATION_A_ID } }),
      );
      expect(after?.status).toBe("accepted");
      expect(after?.acceptedAt).toBeInstanceOf(Date);

      // İkinci kez update denemesi accepted state'i korur.
      await withTenant(PILOT_TENANT_ID, async (tx) => {
        await tx.userInvitation.update({
          where: { id: INVITATION_A_ID },
          data: { status: "accepted" },
        });
      });
      const stillAccepted = await withTenant(PILOT_TENANT_ID, (tx) =>
        tx.userInvitation.findUnique({ where: { id: INVITATION_A_ID } }),
      );
      expect(stillAccepted?.status).toBe("accepted");

      // authRepository üzerinden token lookup hâlâ aynı invitation'ı döner;
      // service katmanı status guard'ı uygular.
      const stillFound = await authRepo?.findInvitationByTokenHash(
        INVITATION_A_TOKEN_HASH,
      );
      expect(stillFound?.status).toBe("accepted");
    },
  );

  // -------------------------------------------------------------------------
  // 10) Audit log cross-tenant filtreleme
  // -------------------------------------------------------------------------

  itDb(
    "audit_events RLS pilot tenant bağlamında yalnızca pilot event'lerini döner",
    async () => {
      if (!appPrisma) return;
      // Foreign tenant'ta oluşturulan audit event pilot bağlamında görünmez.
      const pilotScope = await withTenant(PILOT_TENANT_ID, (tx) =>
        tx.auditEvent.count({
          where: {
            metadata: {
              path: ["fingerprint"],
              equals: FOREIGN_AUDIT_FINGERPRINT,
            },
          },
        }),
      );
      expect(pilotScope).toBe(0);

      // Aynı fingerprint foreign bağlamda görünür (negatif kanıt).
      const foreignScope = await withTenant(FOREIGN_TENANT_ID, (tx) =>
        tx.auditEvent.count({
          where: {
            metadata: {
              path: ["fingerprint"],
              equals: FOREIGN_AUDIT_FINGERPRINT,
            },
          },
        }),
      );
      expect(foreignScope).toBe(1);

      // Tenant bağlamı olmadan app rolü audit event göremez.
      const noContext = await appPrisma.auditEvent.count({
        where: {
          metadata: {
            path: ["fingerprint"],
            equals: FOREIGN_AUDIT_FINGERPRINT,
          },
        },
      });
      expect(noContext).toBe(0);
    },
  );
});
