import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const typescriptFiles = [
  'src/**/*.ts',
  'tests/**/*.ts',
  'scripts/**/*.ts',
  'vite.config.ts',
];

export default defineConfig(
  {
    ignores: [
      'artifacts/**',
      'dist/**',
      'fixtures/**',
      'node_modules/**',
      'scripts/perf/**',
    ],
  },
  {
    files: typescriptFiles,
    extends: [eslint.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: projectRoot,
      },
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
);
