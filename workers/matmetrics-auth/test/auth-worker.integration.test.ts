import { env, exports } from 'cloudflare:workers';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  createPasskeyRegistrationContext,
  PASSKEY_REGISTRATION_CONTEXT_TTL_SECONDS,
  verifyPasskeyRegistrationContext,
} from '../../../src/lib/passkey-registration-context';
import { completePasskeyRegistration } from '../src/identity';
import { auth } from '../src/auth';

const firebaseClaims = {
  appUserId: 'firebase-user-1',
  provider: 'firebase' as const,
  providerSubject: 'firebase-user-1',
  email: 'firebase-user-1@example.test',
  name: 'Firebase User',
  emailVerified: true,
};

function workerFetch(request: Request): Promise<Response> {
  const mainWorker = (exports as unknown as { default: Fetcher }).default;
  return mainWorker.fetch(request);
}

async function signedCookie(token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.BETTER_AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(token)
  );
  const binary = Array.from(new Uint8Array(signature), (byte) =>
    String.fromCharCode(byte)
  ).join('');
  return `better-auth.session_token=${encodeURIComponent(`${token}.${btoa(binary)}`)}`;
}

function authRequest(
  path: string,
  options: { method?: string; cookie?: string; body?: unknown } = {}
): Request {
  const headers = new Headers({ Origin: 'http://localhost:9002' });
  if (options.cookie) headers.set('Cookie', options.cookie);
  if (options.body !== undefined)
    headers.set('Content-Type', 'application/json');
  return new Request(`http://localhost:9002/api/auth${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
}

async function createUser(userId: string): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, ?, NULL, ?, ?)'
  )
    .bind(userId, userId, `${userId}@example.test`, 1, now, now)
    .run();
}

async function createSession(
  userId: string,
  token = `session-${userId}`
): Promise<string> {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)'
  )
    .bind(`session-id-${token}`, now + 60_000, token, now, now, userId)
    .run();
  return signedCookie(token);
}

async function createPasskey(userId: string, id: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO passkey (id, name, publicKey, userId, credentialID, counter, deviceType, backedUp, transports, createdAt, aaguid) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, NULL)'
  )
    .bind(
      id,
      id,
      'AQID',
      userId,
      `credential-${id}`,
      'singleDevice',
      'internal',
      Date.now()
    )
    .run();
}

async function passkeyCount(userId: string): Promise<number> {
  const result = await env.DB.prepare(
    'SELECT count(*) AS count FROM passkey WHERE userId = ?'
  )
    .bind(userId)
    .first<{ count: number }>();
  return result?.count ?? 0;
}

async function startFirebaseRegistration(
  appUserId = `firebase-${crypto.randomUUID()}`
): Promise<{
  context: string;
  claims: Awaited<ReturnType<typeof verifyPasskeyRegistrationContext>>;
  expiresAt: number;
}> {
  const context = await createPasskeyRegistrationContext(
    {
      ...firebaseClaims,
      appUserId,
      providerSubject: appUserId,
      email: `${appUserId}@example.test`,
    },
    env.MATMETRICS_AUTH_CONTEXT_SECRET
  );
  const response = await workerFetch(
    authRequest(
      `/passkey/generate-register-options?context=${encodeURIComponent(context)}`
    )
  );
  expect(response.status).toBe(200);
  const claims = await verifyPasskeyRegistrationContext(
    context,
    env.MATMETRICS_AUTH_CONTEXT_SECRET
  );
  const [, payloadSegment] = context.split('.');
  if (!payloadSegment) throw new Error('Context payload missing');
  const encodedPayload = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(
    atob(encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, '='))
  );
  return { context, claims, expiresAt: payload.exp * 1000 };
}

describe('MatMetrics auth Worker integration', () => {
  it('reserves Firebase enrolment only, without writing an account before verification', async () => {
    const { context, claims, expiresAt } = await startFirebaseRegistration();

    const users = await env.DB.prepare(
      'SELECT count(*) AS count FROM app_users WHERE id = ?'
    )
      .bind(claims.appUserId)
      .first<{ count: number }>();
    const identities = await env.DB.prepare(
      'SELECT count(*) AS count FROM auth_identities WHERE app_user_id = ?'
    )
      .bind(claims.appUserId)
      .first<{ count: number }>();
    const reservations = await env.DB.prepare(
      'SELECT count(*) AS count FROM auth_registration_context_claims WHERE nonce = ?'
    )
      .bind(claims.nonce)
      .first<{ count: number }>();
    expect(users?.count).toBe(0);
    expect(identities?.count).toBe(0);
    expect(reservations?.count).toBe(1);

    await completePasskeyRegistration(env.DB, claims, expiresAt);
    const linked = await env.DB.prepare(
      'SELECT provider, provider_subject FROM auth_identities WHERE app_user_id = ? ORDER BY provider'
    )
      .bind(claims.appUserId)
      .all<{ provider: string; provider_subject: string }>();
    expect(linked.results).toEqual([
      { provider: 'better-auth', provider_subject: claims.appUserId },
      { provider: 'firebase', provider_subject: claims.providerSubject },
    ]);
    await expect(
      completePasskeyRegistration(env.DB, claims, expiresAt)
    ).rejects.toThrow();

    const replay = await workerFetch(
      authRequest(
        `/passkey/generate-register-options?context=${encodeURIComponent(context)}`
      )
    );
    expect(replay.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects public passkey signup while its independent policy is disabled', async () => {
    const userId = `new-passkey-user-${crypto.randomUUID()}`;
    const context = await createPasskeyRegistrationContext(
      {
        appUserId: userId,
        provider: 'better-auth',
        providerSubject: userId,
        email: `${userId}@example.test`,
        name: 'New User',
        emailVerified: false,
      },
      env.MATMETRICS_AUTH_CONTEXT_SECRET
    );
    const response = await workerFetch(
      authRequest(
        `/passkey/generate-register-options?context=${encodeURIComponent(context)}`
      )
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'PASSKEY_REGISTRATION_DISABLED',
    });
  });

  it('rejects tampered, expired, and identity-mismatched registration contexts', async () => {
    const valid = await createPasskeyRegistrationContext(
      firebaseClaims,
      env.MATMETRICS_AUTH_CONTEXT_SECRET
    );
    const [header, payload, signature] = valid.split('.');
    expect(header).toBeTruthy();
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
    const modifiedPayload = JSON.parse(
      atob(payload!.replace(/-/g, '+').replace(/_/g, '/'))
    );
    modifiedPayload.appUserId = 'somebody-else';
    const tampered = `${header}.${btoa(JSON.stringify(modifiedPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.${signature}`;
    const expired = await createPasskeyRegistrationContext(
      firebaseClaims,
      env.MATMETRICS_AUTH_CONTEXT_SECRET,
      Math.floor(Date.now() / 1000) -
        PASSKEY_REGISTRATION_CONTEXT_TTL_SECONDS -
        2
    );
    const wrongIdentity = await createPasskeyRegistrationContext(
      { ...firebaseClaims, providerSubject: 'different-firebase-id' },
      env.MATMETRICS_AUTH_CONTEXT_SECRET
    );

    const countBefore = await env.DB.prepare(
      'SELECT count(*) AS count FROM auth_registration_context_claims'
    ).first<{ count: number }>();
    for (const context of [tampered, expired, wrongIdentity]) {
      const response = await workerFetch(
        authRequest(
          `/passkey/generate-register-options?context=${encodeURIComponent(context)}`
        )
      );
      expect(response.status).toBe(400);
    }
    const countAfter = await env.DB.prepare(
      'SELECT count(*) AS count FROM auth_registration_context_claims'
    ).first<{ count: number }>();
    expect(countAfter?.count).toBe(countBefore?.count);
  });

  it('links the same Firebase identity idempotently across concurrent contexts', async () => {
    const sharedUserId = `firebase-shared-${crypto.randomUUID()}`;
    const [first, second] = await Promise.all([
      startFirebaseRegistration(sharedUserId),
      startFirebaseRegistration(sharedUserId),
    ]);
    await Promise.all([
      completePasskeyRegistration(env.DB, first.claims, first.expiresAt),
      completePasskeyRegistration(env.DB, second.claims, second.expiresAt),
    ]);
    const identities = await env.DB.prepare(
      'SELECT count(*) AS count FROM auth_identities WHERE app_user_id = ?'
    )
      .bind(sharedUserId)
      .first<{ count: number }>();
    expect(identities?.count).toBe(2);
  });

  it('rejects a conflicting pre-existing identity link', async () => {
    const userId = `firebase-conflict-${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO app_users (id, created_at, updated_at) VALUES (?, ?, ?)'
      ).bind('other-user', Date.now(), Date.now()),
      env.DB.prepare(
        'INSERT INTO auth_identities (id, app_user_id, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        `conflict-${crypto.randomUUID()}`,
        'other-user',
        'better-auth',
        userId,
        Date.now()
      ),
    ]);
    const reservation = await startFirebaseRegistration(userId);
    await expect(
      completePasskeyRegistration(
        env.DB,
        reservation.claims,
        reservation.expiresAt
      )
    ).rejects.toThrow(/another MatMetrics user/);
  });

  it('requires an authenticated owner for list, rename, and delete, and blocks the final key', async () => {
    const ownerId = `owner-${crypto.randomUUID()}`;
    const otherOwnerId = `other-owner-${crypto.randomUUID()}`;
    await createUser(ownerId);
    await createUser(otherOwnerId);
    const cookie = await createSession(ownerId);
    await createPasskey(ownerId, `${ownerId}-key-1`);
    await createPasskey(ownerId, `${ownerId}-key-2`);
    await createPasskey(otherOwnerId, `${otherOwnerId}-key`);

    const additionalPasskeyOptions = await workerFetch(
      authRequest('/passkey/generate-register-options', { cookie })
    );
    expect(additionalPasskeyOptions.status).toBe(200);

    const listing = await workerFetch(
      authRequest('/passkey/list-user-passkeys', { cookie })
    );
    expect(listing.status).toBe(200);
    const listed = (await listing.json()) as Array<{ id: string }>;
    expect(listed.map((passkey) => passkey.id).sort()).toEqual([
      `${ownerId}-key-1`,
      `${ownerId}-key-2`,
    ]);

    const rename = await workerFetch(
      authRequest('/passkey/update-passkey', {
        method: 'POST',
        cookie,
        body: { id: `${ownerId}-key-1`, name: 'Phone' },
      })
    );
    expect(rename.status).toBe(200);

    const foreignDelete = await workerFetch(
      authRequest('/passkey/delete-passkey', {
        method: 'POST',
        cookie,
        body: { id: `${otherOwnerId}-key` },
      })
    );
    expect(foreignDelete.status).toBeGreaterThanOrEqual(400);
    expect(await passkeyCount(otherOwnerId)).toBe(1);

    const nonFinalDelete = await workerFetch(
      authRequest('/passkey/delete-passkey', {
        method: 'POST',
        cookie,
        body: { id: `${ownerId}-key-1` },
      })
    );
    expect(nonFinalDelete.status).toBe(200);

    const finalDelete = await workerFetch(
      authRequest('/passkey/delete-passkey', {
        method: 'POST',
        cookie,
        body: { id: `${ownerId}-key-2` },
      })
    );
    expect(finalDelete.status).toBe(409);
    expect(await finalDelete.json()).toMatchObject({
      code: 'LAST_PASSKEY_REQUIRED',
    });
    expect(await passkeyCount(ownerId)).toBe(1);
  });

  it('allows at most one of two concurrent deletions to remove the last key', async () => {
    const userId = `racing-owner-${crypto.randomUUID()}`;
    await createUser(userId);
    const cookie = await createSession(userId);
    await createPasskey(userId, `${userId}-key-1`);
    await createPasskey(userId, `${userId}-key-2`);

    const responses = await Promise.all([
      workerFetch(
        authRequest('/passkey/delete-passkey', {
          method: 'POST',
          cookie,
          body: { id: `${userId}-key-1` },
        })
      ),
      workerFetch(
        authRequest('/passkey/delete-passkey', {
          method: 'POST',
          cookie,
          body: { id: `${userId}-key-2` },
        })
      ),
    ]);
    expect(
      responses.filter((response) => response.status === 200)
    ).toHaveLength(1);
    expect(responses.some((response) => response.status === 409)).toBe(true);
    expect(await passkeyCount(userId)).toBe(1);
  });

  it('issues service JWTs with the Worker JWKS and rejects incorrect claims/signatures', async () => {
    const userId = `jwt-user-${crypto.randomUUID()}`;
    await createUser(userId);
    const cookie = await createSession(userId);
    const tokenResponse = await workerFetch(authRequest('/token', { cookie }));
    expect(tokenResponse.status).toBe(200);
    const token = ((await tokenResponse.json()) as { token: string }).token;

    const jwksResponse = await workerFetch(authRequest('/jwks'));
    expect(jwksResponse.status).toBe(200);
    const jwks = (await jwksResponse.json()) as { keys: JsonWebKey[] };
    const verified = await jwtVerify(token, createLocalJWKSet(jwks), {
      issuer: env.MATMETRICS_AUTH_ISSUER,
      audience: env.MATMETRICS_AUTH_AUDIENCE,
    });
    expect(verified.payload.appUserId).toBe(userId);
    await expect(
      jwtVerify(token, createLocalJWKSet(jwks), {
        issuer: 'https://wrong-issuer.example',
        audience: env.MATMETRICS_AUTH_AUDIENCE,
      })
    ).rejects.toThrow();
    await expect(
      jwtVerify(token, createLocalJWKSet(jwks), {
        issuer: env.MATMETRICS_AUTH_ISSUER,
        audience: 'wrong-audience',
      })
    ).rejects.toThrow();
    const signatureStart = token.lastIndexOf('.') + 1;
    const signatureCharacter = token[signatureStart];
    const modified = `${token.slice(0, signatureStart)}${signatureCharacter === 'a' ? 'b' : 'a'}${token.slice(signatureStart + 1)}`;
    await expect(
      jwtVerify(modified, createLocalJWKSet(jwks), {
        issuer: env.MATMETRICS_AUTH_ISSUER,
        audience: env.MATMETRICS_AUTH_AUDIENCE,
      })
    ).rejects.toThrow();

    const expiredToken = await auth.api.signJWT({
      body: {
        payload: {
          appUserId: userId,
          sub: userId,
          exp: Math.floor(Date.now() / 1000) - 30,
        },
      },
    });
    await expect(
      jwtVerify(expiredToken.token, createLocalJWKSet(jwks), {
        issuer: env.MATMETRICS_AUTH_ISSUER,
        audience: env.MATMETRICS_AUTH_AUDIENCE,
      })
    ).rejects.toThrow(/exp/);
  });

  it('rejects invalid sessions before issuing a JWT', async () => {
    const response = await workerFetch(authRequest('/token'));
    expect(response.status).toBe(401);
  });

  it('rejects expired Better Auth sessions', async () => {
    const userId = `expired-session-${crypto.randomUUID()}`;
    await createUser(userId);
    const cookie = await createSession(userId);
    await env.DB.prepare('UPDATE session SET expiresAt = ? WHERE userId = ?')
      .bind(Date.now() - 1_000, userId)
      .run();

    const response = await workerFetch(authRequest('/token', { cookie }));
    expect(response.status).toBe(401);
  });
});
