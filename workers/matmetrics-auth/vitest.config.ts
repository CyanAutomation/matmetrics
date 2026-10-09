import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const workerRoot = path.dirname(fileURLToPath(import.meta.url));
const testAuthSecret = 'local-auth-test-secret-0123456789-abcdef';
const testContextSecret = 'local-context-test-secret-0123456789-abcdef';
process.env.BETTER_AUTH_SECRET = testAuthSecret;
process.env.MATMETRICS_AUTH_CONTEXT_SECRET = testContextSecret;

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const { readD1Migrations } = await import('@cloudflare/vitest-plugin');
      const migrations = await readD1Migrations(
        path.resolve(workerRoot, '../matmetrics-data/migrations')
      );
      return {
        wrangler: { configPath: path.join(workerRoot, 'wrangler.jsonc') },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: testAuthSecret,
            MATMETRICS_AUTH_CONTEXT_SECRET: testContextSecret,
          },
        },
      };
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
});
