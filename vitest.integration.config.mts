import { defineConfig } from 'vitest/config';

import { loadTestEnv } from './vitest.env.mts';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      ...loadTestEnv(),
      SUPABASE_TEST_INTEGRATION: '1',
    },
  },
});
