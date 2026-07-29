/**
 * ESLint kök konfigürasyonu.
 * Tüm app ve paketler bu preset'i genişletir.
 *
 * Kurallar:
 * - TypeScript strict
 * - Import sırası (eslint-plugin-import)
 * - JSDoc Türkçe yorum standardı
 * - Güvenlik (eslint-plugin-security best-effort)
 */
module.exports = {
  root: false,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.*.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'import', 'jsdoc', 'security'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:jsdoc/recommended',
    'plugin:security/recommended-legacy',
  ],
  settings: {
    'import/resolver': {
      typescript: { project: ['./tsconfig.json', './tsconfig.*.json'] },
      node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
    },
  },
  rules: {
    // Klinik ve finansal kodda any kullanımı yasak; istisna + yorum gerekir.
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      { allowExpressions: true, allowTypedFunctionExpressions: true },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-default-export': 'off',
    'jsdoc/require-description': 'error',
    'jsdoc/require-description-complete-sentence': 'warn',
    'jsdoc/no-types': 'off',
    'security/detect-object-injection': 'warn',
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-process-exit': 'error',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    '.turbo/',
    'coverage/',
    '**/generated/**',
    '*.cjs',
    '*.mjs',
  ],
};
