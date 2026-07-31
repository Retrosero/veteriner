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
    id: "tnt-pilot-kadikoy",
    slug: "pilot-vet-kadikoy",
    name: "Pilot Veteriner Kliniği (Kadıköy)",
    country: "TR",
    defaultLocale: "tr-TR",
    timezone: "Europe/Istanbul",
  },
  branch: {
    id: "brc-pilot-merkez",
    name: "Merkez Şube",
    address: "Caferağa Mah. Test Sk. No:1 Kadıköy/İstanbul",
    phone: "+902160000000",
  },
  users: [
    {
      id: "usr-pilot-owner-1",
      email: "owner@pilot.vetniva.local",
      fullName: "Pilot İşletme Sahibi",
      role: "OWNER",
      passwordEnv: "PILOT_OWNER_PASSWORD",
    },
    {
      id: "usr-pilot-owner-2",
      email: "owner2@pilot.vetniva.local",
      fullName: "Pilot İşletme Sahibi 2",
      role: "OWNER",
      passwordEnv: "PILOT_OWNER2_PASSWORD",
    },
    {
      id: "usr-pilot-vet-1",
      email: "vet@pilot.vetniva.local",
      fullName: "Pilot Veteriner Hekim",
      role: "VETERINARIAN",
      passwordEnv: "PILOT_VET_PASSWORD",
    },
    {
      id: "usr-pilot-staff-1",
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

    // 3. Demo veri (kimlik bilgisi YOK).
    let ownersCreated = 0;
    for (const owner of PILOT_SEED.owners) {
      await this.upsertOwner(owner);
      ownersCreated += 1;
    }
    let patientsCreated = 0;
    for (const patient of PILOT_SEED.patients) {
      await this.upsertPatient(patient);
      patientsCreated += 1;
    }

    this.logger.log(
      `Pilot seed complete: users=${usersCreated} owners=${ownersCreated} patients=${patientsCreated}`,
    );

    return { usersCreated, ownersCreated, patientsCreated };
  }

  /* ----------------------------------------------------------------
   * Repository upsert metodları (DI ile inject edilecek).
   * Production'da Prisma; in-memory'de Map.
   * ----------------------------------------------------------------
   */

  private async upsertTenant(_t: PilotSeed["tenant"]): Promise<void> {
    // TenantRepository.upsert() implementasyonu FAZ-12+ ile bağlanır.
  }

  private async upsertBranch(_b: PilotSeed["branch"]): Promise<void> {
    // BranchRepository.upsert() implementasyonu FAZ-12+ ile bağlanır.
  }

  private async upsertUser(_u: {
    id: string;
    email: string;
    fullName: string;
    role: "OWNER" | "VETERINARIAN" | "STAFF";
    passwordHash: string;
  }): Promise<void> {
    // UserRepository.upsert() implementasyonu FAZ-12+ ile bağlanır.
  }

  private async upsertOwner(_o: PilotSeed["owners"][number]): Promise<void> {
    // OwnerRepository.upsert() implementasyonu FAZ-12+ ile bağlanır.
  }

  private async upsertPatient(_p: PilotSeed["patients"][number]): Promise<void> {
    // PatientRepository.upsert() implementasyonu FAZ-12+ ile bağlanır.
  }
}
