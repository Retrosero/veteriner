/**
 * @file Pilot seed secret doğrulama birim testleri.
 * @module apps/api/common/seed/seed-pilot-tenant.spec
 * @description Seed mutasyonundan önce tüm pilot kullanıcı secret'larının
 * doğrulandığını kanıtlar; gerçek parola veya veri tabanı kullanmaz.
 * @security Eksik secret durumunda tenant ve kullanıcı kaydı oluşturulmamalıdır.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PILOT_SEED,
  PilotSeedService,
  resolvePilotPasswords,
} from "./seed-pilot-tenant.js";

describe("resolvePilotPasswords", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("tüm gerekli secret'ları değişmeden çözer", () => {
    const env = Object.fromEntries(
      PILOT_SEED.users.map((user, index) => [
        user.passwordEnv,
        `test-password-${String(index)}`,
      ]),
    );

    const passwords = resolvePilotPasswords(env);

    expect(Object.keys(passwords)).toHaveLength(PILOT_SEED.users.length);
    expect(passwords[PILOT_SEED.users[0]?.passwordEnv ?? ""]).toBe(
      "test-password-0",
    );
  });

  it("eksik veya yalnızca boşluk içeren secret'ta mutasyon öncesi hata verir", () => {
    const env = Object.fromEntries(
      PILOT_SEED.users.map((user) => [user.passwordEnv, "valid-password"]),
    );
    env[PILOT_SEED.users[1]?.passwordEnv ?? ""] = "   ";

    expect(() => resolvePilotPasswords(env)).toThrow(
      `Missing env ${PILOT_SEED.users[1]?.passwordEnv ?? ""}`,
    );
  });

  it("production ortamında veritabanına bağlanmadan seed işlemini reddeder", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const service = new PilotSeedService();

    await expect(service.run()).rejects.toThrow(
      "Pilot seed cannot run in production",
    );
  });
});
