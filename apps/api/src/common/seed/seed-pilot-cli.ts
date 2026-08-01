/**
 * @file Pilot tenant seed CLI.
 * @module apps/api/common/seed/seed-pilot-cli
 * @description GOAL-120 (FAZ-12) pilot klinik seed komutunu
 * çalıştırır. Production'da çalışmaz (PILOT_SEED guard).
 *
 * Kullanım:
 *   pnpm --filter @vetniva/api seed:pilot.
 * @since GOAL-120 (FAZ-12) pilot tenant kurulumu
 */

import { PilotSeedService } from "./seed-pilot-tenant.js";

/**
 * Pilot seed komutunu calistirir ve sonucunu standart ciktiya yazar.
 */
async function main(): Promise<void> {
  const service = new PilotSeedService();
  const result = await service.run();
  process.stdout.write(
    `Pilot seed OK: users=${result.usersCreated} owners=${result.ownersCreated} patients=${result.patientsCreated}`,
  );
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Bilinmeyen seed hatasi";
  process.stderr.write(`Pilot seed basarisiz: ${message}\n`);
  process.exitCode = 1;
});
