import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: false,
    watch: false,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'test/**/*.unit.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/**/*.int.test.ts', 'test/security/**/*.test.ts'],
          globalSetup: ['./test/setup-integration.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
});
