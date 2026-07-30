import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const typescriptFiles = [
  'src/**/*.ts',
  'tests/**/*.ts',
  'scripts/**/*.ts',
  'lab/**/*.ts',
  'vite.config.ts',
  'vite.patch-map-lab.config.ts',
];

export default defineConfig(
  {
    ignores: [
      'artifacts/**',
      'dist/**',
      '.lab-dist/**',
      'fixtures/**',
      'lab/artifacts/**',
      'lab/fixtures/**',
      'node_modules/**',
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
      // ESLint 10 and typescript-eslint 8.65 added these to their recommended
      // presets. Keep the repository's pre-upgrade lint contract stable; the
      // frozen baselines must not be mechanically rewritten by a tool update.
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
