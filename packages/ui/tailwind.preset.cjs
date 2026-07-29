/**
 * packages/ui Tailwind preset.
 * packages/config üzerindeki temayı devralır ve primitive sınıflarını
 * (button/card/input) ekler. apps/web tarafında tailwind.config.ts bu
 * preset'i extend eder.
 */
const base = require("@vetniva/config/tailwind");

/** @type {import('tailwindcss').Config} */
module.exports = {
  ...base,
  content: ["./src/**/*.{ts,tsx}", "../../apps/web/**/*.{ts,tsx}"],
  theme: {
    ...base.theme,
  },
};
