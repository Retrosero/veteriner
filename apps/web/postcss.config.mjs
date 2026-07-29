/**
 * @file PostCSS konfigürasyonu.
 * @module @vetniva/web/postcss.config
 *
 * @description Tailwind ve Autoprefixer entegrasyonu. apps/web kökünde
 * çalışır; monorepo genelinde başka PostCSS konfigürasyonu yoktur.
 */

/** @type {import('postcss-load-config').Config} */
const postcssConfig = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default postcssConfig;
