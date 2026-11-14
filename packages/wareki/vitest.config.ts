import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: false,
    watch: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
