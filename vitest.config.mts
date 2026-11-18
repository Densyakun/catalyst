import { defineConfig } from 'vitest/config';

import { loadTestEnv } from './vitest.env.mts';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: loadTestEnv(),
  },
});
