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
          50: '#F0F8F3',
          100: '#E6F4EC',
          200: '#A9FFC6',
          300: '#7ED9A0',
          400: '#248A3D',
          500: '#167A4A',
          600: '#10633B',
          700: '#0D4D2E',
          800: '#005F37',
          900: '#002110',
        },
        surface: {
          bg: '#F7F8F7',
          card: '#FFFFFF',
          grouped: '#F1F5F1',
          header: '#F6F8F6',
        },
        vnText: {
          primary: '#1D1D1F',
          secondary: '#5F6368',
          tertiary: '#86868B',
          navInactive: '#4B5563',
        },
        vnBorder: {
          standard: '#E1E5E2',
          divider: '#ECEFED',
          input: '#D5DBD7',
        },
        danger: {
          50: '#FCEBEA',
          500: '#C3362C',
          700: '#93000A',
        },
        warn: {
          50: '#FFF4E5',
          500: '#B86B00',
          700: '#7C2B33',
        },
        success: {
          50: '#EAF6EC',
          500: '#248A3D',
          700: '#005F37',
        },
        info: {
          50: '#EAF3FB',
          500: '#2775B6',
          700: '#1A4D78',
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
