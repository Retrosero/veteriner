/**
 * @file Tailwind konfigürasyonu.
 * @module @vetniva/web/tailwind.config
 *
 * @description apps/web için Tailwind yapılandırması. packages/ui üzerindeki
 * Tailwind preset'i extend edilir; böylece klinik renk paleti ve primitive
 * sınıfları tek noktadan yönetilir.
 *
 * @security UI primitive'leri @vetniva/ui tarafından sağlanır; ek sınıf
 * tanımı bu pakette yapılmaz.
 */

import type { Config } from "tailwindcss";

import uiPreset from "@vetniva/ui/tailwind-preset";

const config: Config = {
  presets: [uiPreset as Config],
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
};

export default config;
