import { pathToFileURL } from 'node:url';

export const DEFAULT_APP_ORIGIN = 'https://matmetrics-teal.vercel.app';
export const DEFAULT_AUTH_WORKER_ORIGIN =
  'https://matmetrics-auth-production.scheimann.workers.dev';

function parseOrigin(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute origin`);
  }

  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(isLoopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTPS origin (or local loopback)`);
  }

  return url.origin;
}

async function getJson(fetchImpl, name, url, validate) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { name, ok: false, status: response.status, detail: 'HTTP error' };
    }

    let body;
    try {
      body = await response.json();
    } catch {
      return {
        name,
        ok: false,
        status: response.status,
        detail: 'response was not JSON',
      };
    }

    const detail = validate(body);
    return {
      name,
      ok: detail !== null,
      status: response.status,
      detail: detail ?? 'response did not match the expected shape',
    };
  } catch {
    return { name, ok: false, detail: 'request failed or timed out' };
  }
}

export async function runBetterAuthProductionPreflight({
  appOrigin,
  workerOrigin,
  fetchImpl = fetch,
}) {
  const app = parseOrigin('appOrigin', appOrigin);
  const worker = parseOrigin('workerOrigin', workerOrigin);
  const checks = await Promise.all([
    getJson(fetchImpl, 'auth-worker-health', `${worker}/healthz`, (body) =>
      body && body.ok === true ? 'health endpoint returned ok=true' : null
    ),
    getJson(fetchImpl, 'same-origin-jwks', `${app}/api/auth/jwks`, (body) => {
      if (!body || !Array.isArray(body.keys) || body.keys.length === 0) {
        return null;
      }
      return `JWKS endpoint returned ${body.keys.length} public key(s)`;
    }),
  ]);

  return {
    checks,
    passed: checks.every((check) => check.ok),
    readOnly: true,
  };
}

async function main() {
  const result = await runBetterAuthProductionPreflight({
    appOrigin:
      process.env.BETTER_AUTH_SMOKE_APP_ORIGIN ?? DEFAULT_APP_ORIGIN,
    workerOrigin:
      process.env.BETTER_AUTH_SMOKE_WORKER_ORIGIN ??
      DEFAULT_AUTH_WORKER_ORIGIN,
  });

  for (const check of result.checks) {
    const state = check.ok ? 'PASS' : 'FAIL';
    const status = check.status ? ` (${check.status})` : '';
    console.log(`${state} ${check.name}${status}: ${check.detail}`);
  }
  console.log(
    'Read-only GET probes only. This does not verify sign-in, account linking, protected data, rate limits, or browser passkey behavior.'
  );

  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Preflight could not run'
    );
    process.exitCode = 1;
  });
}
