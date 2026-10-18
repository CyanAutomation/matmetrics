import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sqlFiles = {
  preflight: 'auth-registration-guards-preflight.sql',
  verify: 'verify-auth-registration-guards.sql',
  'retirement-preflight': 'auth-retirement-preflight.sql',
  'retirement-verify': 'verify-auth-retirement.sql',
} as const;

type MigrationMode = keyof typeof sqlFiles;
type D1CheckRow = { check_name: string; passed?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireValue(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`${name} must be set in the secure operator environment`);
  }
  return value.trim();
}

function splitReadOnlyStatements(sql: string): string[] {
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

function assertReadOnlyResult(
  result: Record<string, unknown> | undefined
): asserts result is Record<string, unknown> {
  const meta = result?.meta;
  if (
    !isRecord(meta) ||
    meta.changed_db !== false ||
    meta.rows_written !== 0 ||
    meta.changes !== 0
  ) {
    throw new Error(
      'D1 did not confirm a read-only query (changed_db must be false and row changes must be zero)'
    );
  }
}

function hasCheckName(value: unknown): value is D1CheckRow {
  return isRecord(value) && typeof value.check_name === 'string';
}

export async function runAuthMigrationCheck({
  mode,
  accountId,
  databaseId,
  apiToken,
  fetchImpl = fetch,
  sqlDirectory = scriptDirectory,
}: {
  mode: string | undefined;
  accountId: string | undefined;
  databaseId: string | undefined;
  apiToken: string | undefined;
  fetchImpl?: typeof fetch;
  sqlDirectory?: string;
}) {
  const fileName =
    mode && Object.hasOwn(sqlFiles, mode)
      ? sqlFiles[mode as MigrationMode]
      : undefined;
  if (!fileName) {
    throw new Error(
      'Choose preflight, verify, retirement-preflight, or retirement-verify'
    );
  }
  const validatedMode = mode as MigrationMode;

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
  const results: unknown[][] = [];

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

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Cloudflare D1 query returned invalid JSON (${response.status})`);
    }
    if (!response.ok || !isRecord(payload) || payload.success !== true) {
      throw new Error(`Cloudflare D1 query failed (HTTP ${response.status})`);
    }

    const firstResult = Array.isArray(payload.result) ? payload.result[0] : undefined;
    const result = isRecord(firstResult) ? firstResult : undefined;
    assertReadOnlyResult(result);
    results.push(Array.isArray(result.results) ? result.results : []);
  }

  if (
    validatedMode === 'verify' ||
    validatedMode === 'retirement-preflight' ||
    validatedMode === 'retirement-verify'
  ) {
    const checks = results
      .flat()
      .filter(hasCheckName);
    const failedCheck = checks.find((check) => check.passed !== 1);
    if (checks.length === 0) {
      throw new Error(`D1 migration check (${validatedMode}) returned no checks`);
    }
    if (failedCheck) {
      throw new Error(
        `D1 migration ${validatedMode} failed: ${failedCheck.check_name}`
      );
    }
  }

  return { mode: validatedMode, results };
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
