import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';

type AuthSessionResult = {
  data?: { user?: { id: string } } | null;
  error?: { message?: string } | null;
};

type AuthTokenResult = {
  data?: { token?: string } | null;
  error?: { message?: string } | null;
};

let sessionResult: AuthSessionResult = { data: null };
let tokenResult: AuthTokenResult = { data: { token: 'better-auth-token' } };
let sessionError: Error | null = null;
let tokenError: Error | null = null;
let sessionCalls = 0;
let tokenCalls = 0;
let getAuthHeaders: typeof import('./auth-session').getAuthHeaders;
let originalConsoleError: typeof console.error;

const originalBetterAuthFlag = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;

before(async () => {
  mock.module('./auth-client', {
    namedExports: {
      authClient: {
        getSession: async () => {
          sessionCalls += 1;
          if (sessionError) throw sessionError;
          return sessionResult;
        },
        token: async () => {
          tokenCalls += 1;
          if (tokenError) throw tokenError;
          return tokenResult;
        },
      },
    },
  } as never);

  ({ getAuthHeaders } = await import('./auth-session'));
});

beforeEach(() => {
  originalConsoleError = console.error;
  console.error = () => undefined;
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'true';
  sessionResult = { data: null };
  tokenResult = { data: { token: 'better-auth-token' } };
  sessionError = null;
  tokenError = null;
  sessionCalls = 0;
  tokenCalls = 0;
});

afterEach(() => {
  console.error = originalConsoleError;
});

after(() => {
  if (originalBetterAuthFlag === undefined) {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = originalBetterAuthFlag;
  }
});

test('returns no authorization header for a successful anonymous session lookup', async () => {
  const headers = new Headers(await getAuthHeaders());

  assert.equal(headers.get('Authorization'), null);
  assert.equal(sessionCalls, 1);
  assert.equal(tokenCalls, 0);
});

test('uses the Better Auth API token for a password or passkey session', async () => {
  sessionResult = { data: { user: { id: 'canonical-user' } } };

  const headers = new Headers(await getAuthHeaders());

  assert.equal(headers.get('Authorization'), 'Bearer better-auth-token');
  assert.equal(sessionCalls, 1);
  assert.equal(tokenCalls, 1);
});

test('fails closed when a Better Auth session has no API token', async () => {
  sessionResult = { data: { user: { id: 'canonical-user' } } };
  tokenResult = { data: null, error: { message: 'token endpoint unavailable' } };

  await assert.rejects(getAuthHeaders(), /Better Auth API token/);
  assert.equal(tokenCalls, 1);
});

test('does not create a service token when Better Auth is disabled', async () => {
  process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';

  const headers = new Headers(await getAuthHeaders());

  assert.equal(headers.get('Authorization'), null);
  assert.equal(sessionCalls, 0);
  assert.equal(tokenCalls, 0);
});

test('fails closed when the Better Auth session cannot be checked', async () => {
  sessionError = new Error('auth service unavailable');

  await assert.rejects(getAuthHeaders(), /Better Auth session/);
  assert.equal(sessionCalls, 1);
  assert.equal(tokenCalls, 0);
});
