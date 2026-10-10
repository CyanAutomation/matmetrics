import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sqlFiles = {
  preflight: 'auth-registration-guards-preflight.sql',
  verify: 'verify-auth-registration-guards.sql',
};

function requireValue(name, value) {
  if (!value?.trim()) {
    throw new Error(`${name} must be set in the secure operator environment`);
  }
  return value.trim();
}

function splitReadOnlyStatements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => {
      if (!/^SELECT\b/i.test(statement)) {
        throw new Error('Migration check files may contain SELECT statements only');
      }
      return statement;
    });
}

function assertReadOnlyResult(result) {
  const meta = result?.meta;
  if (
    !meta ||
    meta.changed_db !== false ||
    meta.rows_written !== 0 ||
    meta.changes !== 0
  ) {
    throw new Error(
      'D1 did not confirm a read-only query (changed_db must be false and row changes must be zero)'
    );
  }
}

export async function runAuthMigrationCheck({
  mode,
  accountId,
  databaseId,
  apiToken,
  fetchImpl = fetch,
  sqlDirectory = scriptDirectory,
}) {
  const fileName = sqlFiles[mode];
  if (!fileName) throw new Error('Choose either preflight or verify');

  const cloudflareAccountId = requireValue('CLOUDFLARE_ACCOUNT_ID', accountId);
  const cloudflareDatabaseId = requireValue(
    'CLOUDFLARE_D1_DATABASE_ID',
    databaseId
  );
  const token = requireValue('CLOUDFLARE_API_TOKEN', apiToken);
  if (!/^[0-9a-f]{32}$/i.test(cloudflareAccountId)) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character hex ID');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cloudflareDatabaseId
    )
  ) {
    throw new Error('CLOUDFLARE_D1_DATABASE_ID must be a UUID');
  }

  const sql = await readFile(path.join(sqlDirectory, fileName), 'utf8');
  const statements = splitReadOnlyStatements(sql);
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/d1/database/${cloudflareDatabaseId}/query`;
  const results = [];

  for (const statement of statements) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: statement }),
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Cloudflare D1 query returned invalid JSON (${response.status})`);
    }
    if (!response.ok || payload.success !== true) {
      throw new Error(`Cloudflare D1 query failed (HTTP ${response.status})`);
    }

    const result = payload.result?.[0];
    assertReadOnlyResult(result);
    results.push(result.results ?? []);
  }

  if (mode === 'verify') {
    const checks = results[0] ?? [];
    const failedCheck = checks.find((check) => check.passed !== 1);
    if (checks.length === 0) {
      throw new Error('D1 migration verification returned no checks');
    }
    if (failedCheck) {
      throw new Error(`D1 migration verification failed: ${failedCheck.check_name}`);
    }
  }

  return { mode, results };
}

async function main() {
  const mode = process.argv[2];
  const result = await runAuthMigrationCheck({
    mode,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'D1 check failed');
    process.exitCode = 1;
  });
}
