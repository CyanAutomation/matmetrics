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
let firebaseToken: string | null = 'firebase-token';
let firebaseUserId: string | null = null;
let sessionCalls = 0;
let tokenCalls = 0;
let firebaseCalls = 0;
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
  mock.module('./firebase-client', {
    namedExports: {
      isFirebaseConfigured: () => true,
      getFirebaseAuth: () => ({
        currentUser: {
          uid: firebaseUserId ?? undefined,
          getIdToken: async () => {
            firebaseCalls += 1;
            return firebaseToken;
          },
        },
      }),
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
  firebaseToken = 'firebase-token';
  firebaseUserId = null;
  sessionCalls = 0;
  tokenCalls = 0;
  firebaseCalls = 0;
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

test('does not fall back to Firebase when a Better Auth session has no API token', async () => {
  sessionResult = { data: { user: { id: 'passkey-user' } } };
  tokenResult = {
    data: null,
    error: { message: 'token endpoint unavailable' },
  };

  await assert.rejects(getAuthHeaders(), /Better Auth API token/);

  assert.equal(sessionCalls, 1);
  assert.equal(tokenCalls, 1);
  assert.equal(firebaseCalls, 0);
});

test('uses the Better Auth API token for an active passkey session', async () => {
  sessionResult = { data: { user: { id: 'passkey-user' } } };

  const headers = new Headers(await getAuthHeaders());

  assert.equal(headers.get('Authorization'), 'Bearer better-auth-token');
  assert.equal(sessionCalls, 1);
  assert.equal(tokenCalls, 1);
  assert.equal(firebaseCalls, 0);
});

test('fails closed when active provider sessions identify different users', async () => {
  sessionResult = { data: { user: { id: 'passkey-user' } } };
  firebaseUserId = 'different-firebase-user';

  await assert.rejects(getAuthHeaders(), /different active users/);

  assert.equal(tokenCalls, 0);
  assert.equal(firebaseCalls, 0);
});

test('uses Better Auth when both active sessions share the canonical user ID', async () => {
  sessionResult = { data: { user: { id: 'firebase-user' } } };
  firebaseUserId = 'firebase-user';

  const headers = new Headers(await getAuthHeaders());

  assert.equal(headers.get('Authorization'), 'Bearer better-auth-token');
  assert.equal(firebaseCalls, 0);
});

test('uses Firebase for a successful Better Auth session lookup with no passkey session', async () => {
  sessionResult = { data: null };

  const headers = new Headers(await getAuthHeaders());

  assert.equal(headers.get('Authorization'), 'Bearer firebase-token');
  assert.equal(sessionCalls, 1);
  assert.equal(tokenCalls, 0);
  assert.equal(firebaseCalls, 1);
});

test('does not fall back to Firebase when the Better Auth session cannot be checked', async () => {
  sessionError = new Error('auth service unavailable');

  await assert.rejects(getAuthHeaders(), /Better Auth session/);

  assert.equal(sessionCalls, 1);
  assert.equal(tokenCalls, 0);
  assert.equal(firebaseCalls, 0);
});
