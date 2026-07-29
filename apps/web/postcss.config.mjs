/**
 * @file PostCSS konfigürasyonu.
 * @module @vetniva/web/postcss.config
 *
 * @description Tailwind ve Autoprefixer entegrasyonu. Tailwind
 * konfigürasyonu workspace kökünde (`tailwind.config.cjs`)
 * bulunur; Next.js varsayılan konumda otomatik arar.
 */

/** @type {import('postcss-load-config').Config} */
const postcssConfig = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default postcssConfig;
