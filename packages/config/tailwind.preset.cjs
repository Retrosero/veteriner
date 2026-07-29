/**
 * Tailwind preset.
 * Klinik arayüz için nötr gri tonu + vurgu rengi (mavi-700).
 * packages/ui üzerinden bu preset extend edilir.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        clinic: {
          50: '#f0f7ff',
          100: '#e0eefe',
          200: '#bbdcfd',
          300: '#7ec1fc',
          400: '#39a4f8',
          500: '#0f8aed',
          600: '#026fc7',
          700: '#0359a1',
          800: '#064b85',
          900: '#0a406e',
        },
        danger: {
          50: '#fef2f2',
          500: '#ef4444',
          700: '#b91c1c',
        },
        warn: {
          50: '#fffbeb',
          500: '#f59e0b',
          700: '#b45309',
        },
        success: {
          50: '#ecfdf5',
          500: '#10b981',
          700: '#047857',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
      },
    },
  },
};
