/**
 * @file Prisma migration rol sarmalayıcısı.
 * @description Migration komutunu yalnızca `DATABASE_MIGRATOR_URL` ile
 * çalıştırır; runtime uygulama rolünün DDL yetkisi kazanmasını engeller.
 * @security `DATABASE_URL` uygulama rolüne ait kalır. Bu betik process
 * ortamında yalnızca Prisma child process'i için migrator URL'sini kullanır.
 */

import { spawnSync } from "node:child_process";

const migratorUrl = process.env.DATABASE_MIGRATOR_URL;

if (!migratorUrl) {
  console.error(
    "DATABASE_MIGRATOR_URL zorunludur; migration runtime uygulama rolüyle çalıştırılamaz.",
  );
  process.exit(1);
}

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  pnpmCommand,
  ["exec", "prisma", "migrate", "deploy", ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: migratorUrl },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
