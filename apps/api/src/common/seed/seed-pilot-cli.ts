/**
 * @file Pilot tenant seed CLI.
 * @module apps/api/common/seed/seed-pilot-cli
 *
 * @description GOAL-120 (FAZ-12) pilot klinik seed komutunu
 * çalıştırır. Production'da çalışmaz (PILOT_SEED guard).
 *
 * Kullanım:
 *   pnpm --filter @vetniva/api seed:pilot
 *
 * @since GOAL-120 (FAZ-12) pilot tenant kurulumu
 */

import { PilotSeedService } from "./seed-pilot-tenant.js";

async function main(): Promise<void> {
  const service = new PilotSeedService();
  const result = await service.run();
  console.log(
    `Pilot seed OK: users=${result.usersCreated} owners=${result.ownersCreated} patients=${result.patientsCreated}`,
  );
  process.exit(0);
}

void main();
