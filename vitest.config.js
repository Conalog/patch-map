import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          include: ['./src/**/*.{test,spec}.js'],
          exclude: ['./src/patchmap.test.js'],
          name: 'unit',
          environment: 'node',
        },
      },
      {
        test: {
          include: ['./src/patchmap.test.js'],
          name: 'browser',
          browser: {
            provider: 'playwright',
            enabled: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
