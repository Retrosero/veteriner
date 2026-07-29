/**
 * Prettier kök konfigürasyonu.
 * Tüm app ve paketler bu preset'i kullanır.
 */
module.exports = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  endOfLine: 'lf',
  arrowParens: 'always',
  bracketSpacing: true,
  plugins: [],
  overrides: [
    {
      files: ['*.md', '*.yml', '*.yaml'],
      options: { proseWrap: 'preserve' },
    },
    {
      files: ['*.json', '*.jsonc'],
      options: { singleQuote: false },
    },
  ],
};
