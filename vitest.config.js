import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          include: ['./src/**/*.{test,spec}.js'],
          exclude: ['**/tests/**'],
          name: 'unit',
          environment: 'node',
        },
      },
      {
        test: {
          include: ['**/tests/**/*.{test,spec}.js'],
          name: 'browser',
          browser: {
            provider: playwright(),
            enabled: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
