/**
 * @file Next.js kök konfigürasyonu.
 * @module @vetniva/web/next.config
 *
 * @description apps/web paketinin Next.js yapılandırması. GOAL-000 kapsamında
 * standalone build, typedRoutes ve monorepo outputFileTracingRoot ayarlanır.
 *
 * @security X-Request-Id gibi başlıklar runtime'da eklenir; burada
 * hardcode secret bulunmaz.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Monorepo kökü; outputFileTracingRoot için gerekli. */
const repoRoot = path.resolve(__dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  experimental: {
    typedRoutes: true,
    outputFileTracingRoot: repoRoot,
  },
  transpilePackages: [
    "@vetniva/ui",
    "@vetniva/contracts",
    "@vetniva/i18n",
    "@vetniva/config",
  ],
  // Next 14 varsayılanı ENV üzerinden telemetri kapatma; CI'da gürültü önlenir.
  env: {
    APP_NAME: process.env["APP_NAME"] ?? "vetniva",
  },
};

export default nextConfig;
