import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser }, ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      // any допустим в коде разбора недоверенных данных сохранений — там он сразу проверяется вручную.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },
  { files: ['e2e/**', 'tests/**', '*.config.*'], languageOptions: { globals: { ...globals.node } } },
);
