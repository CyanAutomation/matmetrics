import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeEach } from 'vitest';

beforeEach(async () => {
  if (!env.TEST_MIGRATIONS?.length) {
    throw new Error('Auth Worker tests did not receive the D1 migration list');
  }
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const authTable = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user'"
  ).first<{ name: string }>();
  if (!authTable)
    throw new Error(
      'Auth Worker D1 migrations did not create Better Auth tables'
    );
});
