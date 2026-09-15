import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/node_modules/**', '**/.artifacts/**', 'packages/**'] },
  {
    files: ['verification/**/*.mjs', '.github/scripts/**/*.mjs'],
    extends: [eslint.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['verification/**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)) },
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
