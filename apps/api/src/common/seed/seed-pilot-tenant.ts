/**
 * @file Pilot tenant seed verisi.
 * @module apps/api/common/seed/seed-pilot-tenant
 *
 * @description GOAL-120 (FAZ-12) pilot klinik için tenant,
 * şube, kullanıcı ve temel katalog verisi seed eder.
 * Repoya gerçek parola veya kişisel veri yazılmaz;
 * tüm credential'lar `PILOT_*_PASSWORD` env üzerinden
 * alınır (FAZ-12 production'da Vault/Secrets Manager).
 *
 * Kullanım:
 *   pnpm --filter @vetniva/api seed:pilot
 *
 * @security Seed sadece `NODE_ENV !== 'production'` ortamında
 *   çalışır. Production'da hata fırlatır.
 *
 * @since GOAL-120 (FAZ-12) pilot tenant kurulumu
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../auth/password.js";

/** Pilot klinik seed verisi. */
export interface PilotSeed {
  tenant: {
    id: string;
    slug: string;
    name: string;
    country: "TR";
    defaultLocale: "tr-TR";
    timezone: string;
  };
  branch: {
    id: string;
    name: string;
    address: string;
    phone: string;
  };
  users: Array<{
    id: string;
    email: string;
    fullName: string;
    role: "OWNER" | "VETERINARIAN" | "STAFF";
    passwordEnv: string;
  }>;
  /** Demo verisi: 2 hayvan + 2 sahip (kimlik bilgisi YOK). */
  owners: Array<{
    id: string;
    fullName: string;
    phone: string;
  }>;
  patients: Array<{
    id: string;
    name: string;
    species: "dog" | "cat" | "bird";
    ownerId: string;
  }>;
}

/** Standart pilot tenant. */
export const PILOT_SEED: PilotSeed = {
  tenant: {
    id: "11c6beec-7c64-4cf6-9cb7-d9ea6fd5c8a1",
    slug: "pilot-vet-kadikoy",
    name: "Pilot Veteriner Kliniği (Kadıköy)",
    country: "TR",
    defaultLocale: "tr-TR",
    timezone: "Europe/Istanbul",
  },
  branch: {
    id: "b203d16a-91e2-49c0-b9d7-9bdc55fdf60d",
    name: "Merkez Şube",
    address: "Caferağa Mah. Test Sk. No:1 Kadıköy/İstanbul",
    phone: "+902160000000",
  },
  users: [
    {
      id: "92a2c09a-d719-4a9a-b247-94a0e5d25848",
      email: "owner@pilot.vetniva.local",
      fullName: "Pilot İşletme Sahibi",
      role: "OWNER",
      passwordEnv: "PILOT_OWNER_PASSWORD",
    },
    {
      id: "128183c1-9adf-4783-981f-9487019fc7b2",
      email: "owner2@pilot.vetniva.local",
      fullName: "Pilot İşletme Sahibi 2",
      role: "OWNER",
      passwordEnv: "PILOT_OWNER2_PASSWORD",
    },
    {
      id: "9c0a2f2a-697e-4bf0-a1bd-b965bdb171b9",
      email: "vet@pilot.vetniva.local",
      fullName: "Pilot Veteriner Hekim",
      role: "VETERINARIAN",
      passwordEnv: "PILOT_VET_PASSWORD",
    },
    {
      id: "e3591932-4c98-45b9-a085-b1df0f4ec606",
      email: "staff@pilot.vetniva.local",
      fullName: "Pilot Resepsiyon",
      role: "STAFF",
      passwordEnv: "PILOT_STAFF_PASSWORD",
    },
  ],
  owners: [
    { id: "own-pilot-1", fullName: "Demo Sahip 1", phone: "+905550000001" },
    { id: "own-pilot-2", fullName: "Demo Sahip 2", phone: "+905550000002" },
  ],
  patients: [
    {
      id: "pat-pilot-1",
      name: "Karabaş",
      species: "dog",
      ownerId: "own-pilot-1",
    },
    {
      id: "pat-pilot-2",
      name: "Minnoş",
      species: "cat",
      ownerId: "own-pilot-2",
    },
  ],
};

/**
 * Pilot seed servisi. Production'da hata fırlatır;
 * development + test + staging'de çalışır.
 */
@Injectable()
export class PilotSeedService {
  private readonly logger = new Logger(PilotSeedService.name);
  private readonly prisma = new PrismaClient();

  /**
   * Pilot tenant'ı kurar. Production'da hata fırlatır.
   * @returns kurulan kullanıcı sayısı
   */
  public async run(): Promise<{
    usersCreated: number;
    ownersCreated: number;
    patientsCreated: number;
  }> {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error(
        "Pilot seed cannot run in production. Use real tenant onboarding.",
      );
    }

    this.logger.warn(
      `Pilot seed running: tenant=${PILOT_SEED.tenant.slug} (${PILOT_SEED.tenant.id})`,
    );

    // 1. Tenant + branch (idempotent; var olanı atla).
    await this.upsertTenant(PILOT_SEED.tenant);
    await this.upsertBranch(PILOT_SEED.branch);

    // 2. Kullanıcılar (parolalar env'den).
    let usersCreated = 0;
    for (const user of PILOT_SEED.users) {
      const password = process.env[user.passwordEnv];
      if (!password) {
        throw new Error(
          `Missing env ${user.passwordEnv} for pilot user ${user.email}`,
        );
      }
      const passwordHash = await hashPassword(password);
      await this.upsertUser({ ...user, passwordHash });
      usersCreated += 1;
    }

    // Sahip/hasta modülleri henüz bellek-içi repository kullanıyor.
    // Kalıcıymış gibi demo veri yazmayız; kabul senaryosu bunları API ile oluşturur.
    const ownersCreated = 0;
    const patientsCreated = 0;

    this.logger.log(
      `Pilot seed complete: users=${usersCreated} owners=${ownersCreated} patients=${patientsCreated}`,
    );

    await this.prisma.$disconnect();
    return { usersCreated, ownersCreated, patientsCreated };
  }

  /* ----------------------------------------------------------------
   * Repository upsert metodları (DI ile inject edilecek).
   * Production'da Prisma; in-memory'de Map.
   * ----------------------------------------------------------------
   */

  private async upsertTenant(t: PilotSeed["tenant"]): Promise<void> {
    await this.prisma.tenant.upsert({
      where: { slug: t.slug },
      create: { ...t },
      update: { name: t.name, country: t.country, defaultLocale: t.defaultLocale, timezone: t.timezone, status: "active" },
    });
  }

  private async upsertBranch(b: PilotSeed["branch"]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      await tx.branch.upsert({
        where: { tenantId_code: { tenantId: PILOT_SEED.tenant.id, code: "merkez" } },
        create: { id: b.id, tenantId: PILOT_SEED.tenant.id, code: "merkez", name: b.name, city: "İstanbul", addressJson: { formatted: b.address }, phone: b.phone },
        update: { name: b.name, city: "İstanbul", addressJson: { formatted: b.address }, phone: b.phone, status: "active" },
      });
    });
  }

  private async upsertUser(u: {
    id: string;
    email: string;
    fullName: string;
    role: "OWNER" | "VETERINARIAN" | "STAFF";
    passwordHash: string;
  }): Promise<void> {
    const user = await this.prisma.user.upsert({
      where: { email: u.email },
      create: { id: u.id, email: u.email, displayName: u.fullName, passwordHash: u.passwordHash, passwordChangedAt: new Date() },
      update: { displayName: u.fullName, passwordHash: u.passwordHash, passwordChangedAt: new Date(), status: "active" },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      await tx.userTenantMembership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId: PILOT_SEED.tenant.id } },
        create: { userId: user.id, tenantId: PILOT_SEED.tenant.id, role: u.role },
        update: { role: u.role, status: "active", revokedAt: null },
      });
    });
  }

  private async upsertOwner(_o: PilotSeed["owners"][number]): Promise<void> {
    // OwnerRepository.upsert() implementasyonu FAZ-12+ ile bağlanır.
  }

  private async upsertPatient(
    _p: PilotSeed["patients"][number],
  ): Promise<void> {
    // PatientRepository.upsert() implementasyonu FAZ-12+ ile bağlanır.
  }
}
