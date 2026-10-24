import { pathToFileURL } from 'node:url';
import { NextRequest } from 'next/server';
import { verifyBetterAuthToken } from '../src/lib/better-auth-token-verifier.server';
import {
  forwardSessionRequestToKeiko,
  listAllKeikoSessions,
} from '../src/lib/keiko-session-gateway.server';
import type { JudoSession } from '../src/lib/types';

const COOKIE_NAMES = new Set([
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
]);

export type ImportReport = {
  sourceCount: number;
  parseFailures: number;
  duplicateIds: number;
  alreadyPresent: number;
  payloadMismatches: number;
  keikoOnly: number;
  importable: number;
  imported: number;
};

function canonicalSession(session: JudoSession): string {
  const normalized = Object.fromEntries(
    Object.entries(session)
      .filter(([key, value]) => key !== 'revisionSha' && value !== undefined && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
  );
  return JSON.stringify(normalized);
}

export function summarizeImport(
  source: JudoSession[],
  issues: unknown[],
  existing: JudoSession[]
): { report: ImportReport; importable: JudoSession[] } {
  const counts = new Map<string, number>();
  for (const session of source) counts.set(session.id, (counts.get(session.id) ?? 0) + 1);
  const sourceIds = new Set(source.map((session) => session.id));
  const keikoOnly = new Set(existing
    .filter((session) => !sourceIds.has(session.id))
    .map((session) => session.id)).size;
  const existingById = new Map(existing.map((session) => [session.id, session]));
  const duplicates = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
  let alreadyPresent = 0;
  let payloadMismatches = 0;
  const importable = source.filter((session) => {
    if (duplicates.has(session.id)) return false;
    const current = existingById.get(session.id);
    if (!current) return true;
    if (canonicalSession(current) === canonicalSession(session)) alreadyPresent += 1;
    else payloadMismatches += 1;
    return false;
  });
  return {
    report: {
      sourceCount: source.length,
      parseFailures: issues.length,
      duplicateIds: duplicates.size,
      alreadyPresent,
      payloadMismatches,
      keikoOnly,
      importable: importable.length,
      imported: 0,
    },
    importable,
  };
}

function sessionCookie(): string {
  const value = process.env.BETTER_AUTH_SESSION_COOKIE?.trim();
  if (!value || value.length > 4096 || value.includes(';') || value.includes(',')) {
    throw new Error('BETTER_AUTH_SESSION_COOKIE must contain exactly one session cookie');
  }
  const separator = value.indexOf('=');
  if (separator <= 0 || !COOKIE_NAMES.has(value.slice(0, separator))) {
    throw new Error('BETTER_AUTH_SESSION_COOKIE must use the configured Better Auth session cookie name');
  }
  return value;
}

function baseOrigin(name: string): URL {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (
    (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost' && url.protocol === 'http:')) ||
    url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')
  ) throw new Error(`${name} must be a trusted origin`);
  return url;
}

async function run(apply: boolean): Promise<ImportReport> {
  const bearer = process.env.MATMETRICS_BEARER_TOKEN?.trim();
  if (!bearer) throw new Error('MATMETRICS_BEARER_TOKEN is required');
  const principal = await verifyBetterAuthToken(bearer);
  const appOrigin = baseOrigin('MATMETRICS_API_BASE_URL');
  const trustedOrigin = baseOrigin('MATMETRICS_AUTH_FRONTEND_ORIGIN');
  if (appOrigin.origin !== trustedOrigin.origin) {
    throw new Error('MatMetrics API origin must match the configured Better Auth frontend origin');
  }
  const cookie = sessionCookie();
  const sourceUrl = new URL('/api/sessions/list?force=1', appOrigin);
  const sourceResponse = await fetch(sourceUrl, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${bearer}`,
      cookie,
      origin: trustedOrigin.origin,
      'sec-fetch-site': 'same-origin',
    },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!sourceResponse.ok) throw new Error(`MatMetrics source read failed (${sourceResponse.status})`);
  const sourceValue: unknown = await sourceResponse.json();
  if (
    !sourceValue || typeof sourceValue !== 'object' ||
    !('sessions' in sourceValue) || !Array.isArray(sourceValue.sessions) ||
    !('issues' in sourceValue) || !Array.isArray(sourceValue.issues)
  ) throw new Error('MatMetrics returned an invalid session export');
  const source = sourceValue.sessions as JudoSession[];
  const issues = sourceValue.issues;
  const gatewayRequest = new NextRequest(new URL('/api/sessions/list', trustedOrigin), {
    headers: {
      cookie,
      origin: trustedOrigin.origin,
      'sec-fetch-site': 'same-origin',
    },
  });
  const existingResponse = await listAllKeikoSessions(gatewayRequest, principal, new URLSearchParams());
  if (!existingResponse.ok) throw new Error(`Keiko comparison read failed (${existingResponse.status})`);
  const existingValue: unknown = await existingResponse.json();
  if (!existingValue || typeof existingValue !== 'object' || !('sessions' in existingValue) || !Array.isArray(existingValue.sessions)) {
    throw new Error('Keiko returned an invalid session list');
  }
  const { report, importable } = summarizeImport(source, issues, existingValue.sessions as JudoSession[]);
  if (apply) {
    for (const session of importable) {
      const response = await forwardSessionRequestToKeiko(gatewayRequest, principal, {
        path: '/v1/sessions',
        method: 'POST',
        scope: 'sessions:write',
        body: session,
      });
      if (response.status !== 201) {
        throw new Error(`Keiko import stopped on session ${session.id} (${response.status})`);
      }
      report.imported += 1;
    }
  }
  return report;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  try {
    const report = await run(apply);
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : 'Import failed',
      mode: apply ? 'apply' : 'dry-run',
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
