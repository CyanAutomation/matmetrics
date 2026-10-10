import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAuthMigrationCheck } from './auth-migration-check.mjs';

const config = {
  mode: 'verify',
  accountId: 'c40f3cb30efbf8c6d081cf9e50a61931',
  databaseId: 'f5bd4a58-dc03-4282-b6c2-1c356daa613c',
  apiToken: 'test-token-never-logged',
};

test('migration checker sends only SELECT statements and requires unchanged D1 metadata', async () => {
  const requests = [];
  const result = await runAuthMigrationCheck({
    ...config,
    fetchImpl: async (url, options) => {
      const sql = JSON.parse(options.body).sql;
      requests.push({ url, options, sql });
      return new Response(
        JSON.stringify({
          success: true,
          result: [
            {
              results: sql.includes("'0004 migration history row'")
                ? [{ check_name: '0004 migration history row', passed: 1 }]
                : [{ cleanup_target: 'aggregate only', rows_that_would_be_deleted: 0 }],
              meta: { changed_db: false, rows_written: 0, changes: 0 },
            },
          ],
        }),
        { status: 200 }
      );
    },
  });

  assert.equal(result.mode, 'verify');
  assert.equal(requests.length, 6);
  assert.ok(requests.every(({ sql }) => /^SELECT\b/i.test(sql)));
  assert.ok(requests.every(({ options }) => options.method === 'POST'));
  assert.ok(requests.every(({ options }) => options.redirect === 'error'));
  assert.equal(JSON.stringify(result).includes(config.apiToken), false);
});

test('migration checker stops if D1 reports any database change', async () => {
  await assert.rejects(
    runAuthMigrationCheck({
      ...config,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                results: [],
                meta: { changed_db: true, rows_written: 0, changes: 0 },
              },
            ],
          }),
          { status: 200 }
        ),
    }),
    /did not confirm a read-only query/
  );
});

test('migration checker refuses SQL statements outside SELECT', async () => {
  const sqlDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'matmetrics-d1-check-')
  );
  try {
    await writeFile(
      path.join(sqlDirectory, 'auth-registration-guards-preflight.sql'),
      'SELECT 1; DELETE FROM user;'
    );
    await assert.rejects(
      runAuthMigrationCheck({
        ...config,
        mode: 'preflight',
        sqlDirectory,
        fetchImpl: async () => {
          throw new Error('request should not be sent');
        },
      }),
      /SELECT statements only/
    );
  } finally {
    await rm(sqlDirectory, { recursive: true, force: true });
  }
});
