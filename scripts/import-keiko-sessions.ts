import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NextRequest } from 'next/server';
import { verifyBetterAuthToken } from '../src/lib/better-auth-token-verifier.server';
import { markdownToSession } from '../src/lib/markdown-serializer';
import {
  forwardSessionRequestToKeiko,
  listAllKeikoSessions,
} from '../src/lib/keiko-session-gateway.server';
import type { JudoSession } from '../src/lib/types';

const COOKIE_NAMES = new Set([
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
]);

function normalizeExportSession(value: unknown): JudoSession {
  if (
    value && typeof value === 'object' && !Array.isArray(value) &&
    'techniques' in value && value.techniques === null
  ) {
    return { ...value, techniques: [] } as unknown as JudoSession;
  }
  return value as JudoSession;
}

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

type ImportWritePacerOptions = {
  minimumIntervalMs?: number;
  now?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
};

export function createImportWritePacer({
  minimumIntervalMs = 3_000,
  now = Date.now,
  sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
}: ImportWritePacerOptions = {}): () => Promise<void> {
  let nextWriteAt = 0;
  return async () => {
    const waitMs = nextWriteAt - now();
    if (waitMs > 0) await sleep(waitMs);
    nextWriteAt = now() + minimumIntervalMs;
  };
}

export function parseSessionExport(value: unknown): {
  sessions: JudoSession[];
  issues: unknown[];
} {
  if (Array.isArray(value)) {
    // The GitHub-backed API returns its parsed sessions as a bare array.
    return { sessions: value.map(normalizeExportSession), issues: [] };
  }
  if (
    value && typeof value === 'object' &&
    'sessions' in value && Array.isArray(value.sessions) &&
    'issues' in value && Array.isArray(value.issues)
  ) {
    return {
      sessions: value.sessions.map(normalizeExportSession),
      issues: value.issues,
    };
  }
  throw new Error('MatMetrics returned an invalid session export');
}

export function parseMarkdownFiles(files: Array<{ filePath: string; contents: string }>): {
  sessions: JudoSession[];
  issues: Array<{ filePath: string }>;
} {
  const sessions: JudoSession[] = [];
  const issues: Array<{ filePath: string }> = [];
  for (const file of files) {
    try {
      sessions.push(markdownToSession(file.contents));
    } catch {
      issues.push({ filePath: file.filePath });
    }
  }
  return { sessions, issues };
}

async function readMarkdownSource(root = resolve('data')): Promise<{
  sessions: JudoSession[];
  issues: Array<{ filePath: string }>;
}> {
  const files: Array<{ filePath: string; contents: string }> = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push({
          filePath: relative(process.cwd(), absolutePath).split(sep).join('/'),
          contents: await readFile(absolutePath, 'utf8'),
        });
      }
    }
  }
  await visit(root);
  return parseMarkdownFiles(files);
}

export function createImporterGatewayRequest(
  trustedOrigin: URL,
  bearer: string,
  cookie: string
): NextRequest {
  return new NextRequest(new URL('/api/sessions/list', trustedOrigin), {
    headers: {
      authorization: `Bearer ${bearer}`,
      cookie,
      origin: trustedOrigin.origin,
      'sec-fetch-site': 'same-origin',
    },
  });
}

const SAFE_AUTH_ERRORS = new Set([
  'Authentication required',
  'Invalid access token',
  'Session authentication failed',
  'Session authentication is unavailable',
  'Session token validation failed',
]);

export async function safeResponseError(response: Response): Promise<string | null> {
  try {
    const value: unknown = await response.clone().json();
    if (!value || typeof value !== 'object' || !('error' in value)) return null;
    const error = value.error;
    const message =
      typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : null;
    if (message && SAFE_AUTH_ERRORS.has(message)) return message;
  } catch {
    // Keep the importer output generic when a service returns a non-JSON body.
  }
  return null;
}

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

async function run(apply: boolean, markdownSource: boolean): Promise<ImportReport> {
  const bearer = process.env.MATMETRICS_BEARER_TOKEN?.trim();
  if (!bearer) throw new Error('MATMETRICS_BEARER_TOKEN is required');
  const principal = await verifyBetterAuthToken(bearer);
  const appOrigin = baseOrigin('MATMETRICS_API_BASE_URL');
  const trustedOrigin = baseOrigin('MATMETRICS_AUTH_FRONTEND_ORIGIN');
  if (appOrigin.origin !== trustedOrigin.origin) {
    throw new Error('MatMetrics API origin must match the configured Better Auth frontend origin');
  }
  const cookie = sessionCookie();
  let source: JudoSession[];
  let issues: unknown[];
  if (markdownSource) {
    ({ sessions: source, issues } = await readMarkdownSource());
  } else {
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
    ({ sessions: source, issues } = parseSessionExport(sourceValue));
  }
  const gatewayRequest = createImporterGatewayRequest(trustedOrigin, bearer, cookie);
  const existingResponse = await listAllKeikoSessions(gatewayRequest, principal, new URLSearchParams());
  if (!existingResponse.ok) {
    const safeError = await safeResponseError(existingResponse);
    throw new Error(
      `Keiko comparison read failed (${existingResponse.status})${safeError ? `: ${safeError}` : ''}`
    );
  }
  const existingValue: unknown = await existingResponse.json();
  if (!existingValue || typeof existingValue !== 'object' || !('sessions' in existingValue) || !Array.isArray(existingValue.sessions)) {
    throw new Error('Keiko returned an invalid session list');
  }
  const { report, importable } = summarizeImport(source, issues, existingValue.sessions as JudoSession[]);
  if (apply) {
    const paceBeforeWrite = createImportWritePacer();
    for (const session of importable) {
      await paceBeforeWrite();
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
  const markdownSource = process.argv.includes('--markdown-source');
  try {
    const report = await run(apply, markdownSource);
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      source: markdownSource ? 'markdown' : 'api',
      ...report,
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : 'Import failed',
      mode: apply ? 'apply' : 'dry-run',
      source: markdownSource ? 'markdown' : 'api',
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
