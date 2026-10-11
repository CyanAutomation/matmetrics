import { env, exports } from 'cloudflare:workers';
import { createLocalJWKSet, jwtVerify, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { auth } from '../src/auth';

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
  options: {
    method?: string;
    cookie?: string;
    body?: unknown;
    redirect?: RequestRedirect;
    clientIp?: string;
  } = {}
): Request {
  const headers = new Headers({
    Origin: 'http://localhost:9002',
    'CF-Connecting-IP': options.clientIp ?? crypto.randomUUID(),
  });
  if (options.cookie) headers.set('Cookie', options.cookie);
  if (options.body !== undefined)
    headers.set('Content-Type', 'application/json');
  return new Request(`http://localhost:9002/api/auth${path}`, {
    method: options.method ?? 'GET',
    headers,
    redirect: options.redirect,
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

describe('MatMetrics auth Worker integration', () => {
  it('returns one generic unavailable response when email delivery is not configured', async () => {
    const previousApiKey = env.RESEND_API_KEY;
    const previousSender = env.MATMETRICS_AUTH_EMAIL_FROM;
    const previousSignupFlag = env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED;
    const userId = 'email-outage-' + crypto.randomUUID();
    const email = userId + '@example.test';
    await createUser(userId);
    env.RESEND_API_KEY = '';
    env.MATMETRICS_AUTH_EMAIL_FROM = '';
    env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED = 'true';

    try {
      const knownReset = await workerFetch(
        authRequest('/request-password-reset', {
          method: 'POST',
          body: { email, redirectTo: 'http://localhost:9002/reset-password' },
        })
      );
      const unknownReset = await workerFetch(
        authRequest('/request-password-reset', {
          method: 'POST',
          body: {
            email: 'unknown-' + crypto.randomUUID() + '@example.test',
            redirectTo: 'http://localhost:9002/reset-password',
          },
        })
      );
      const signup = await workerFetch(
        authRequest('/sign-up/email', {
          method: 'POST',
          body: {
            name: 'New User',
            email: 'new-' + crypto.randomUUID() + '@example.test',
            password: 'strong-password-123',
          },
        })
      );
      const emailSignIn = await workerFetch(
        authRequest('/sign-in/email', {
          method: 'POST',
          body: { email, password: 'strong-password-123' },
        })
      );
      const resendVerification = await workerFetch(
        authRequest('/send-verification-email', {
          method: 'POST',
          body: { email, callbackURL: 'http://localhost:9002/' },
        })
      );

      expect(knownReset.status).toBe(503);
      expect(unknownReset.status).toBe(503);
      const knownResetBody = await knownReset.json();
      const unknownResetBody = await unknownReset.json();
      expect(knownResetBody).toEqual(unknownResetBody);
      expect(unknownResetBody).toMatchObject({
        code: 'AUTH_EMAIL_DELIVERY_UNAVAILABLE',
      });
      expect(signup.status).toBe(503);
      expect(emailSignIn.status).toBe(503);
      expect(resendVerification.status).toBe(503);
    } finally {
      env.RESEND_API_KEY = previousApiKey;
      env.MATMETRICS_AUTH_EMAIL_FROM = previousSender;
      env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED = previousSignupFlag;
    }
  });

  it('keeps email sign-up disabled until the Worker flag is enabled, then requires verification', async () => {
    const previous = env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED;
    env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED = 'false';
    const email = 'signup-disabled-' + crypto.randomUUID() + '@example.test';
    const disabled = await workerFetch(
      authRequest('/sign-up/email', {
        method: 'POST',
        body: { name: 'New User', email, password: 'strong-password-123' },
      })
    );
    expect(disabled.status).toBeGreaterThanOrEqual(400);

    env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED = 'true';
    try {
      const signup = await workerFetch(
        authRequest('/sign-up/email', {
          method: 'POST',
          body: {
            name: 'New User',
            email,
            password: 'strong-password-123',
            callbackURL: 'http://localhost:9002/',
          },
        })
      );
      expect(signup.status).toBe(200);

      const user = await env.DB.prepare(
        'SELECT id, emailVerified FROM user WHERE lower(email) = lower(?)'
      )
        .bind(email)
        .first<{ id: string; emailVerified: number }>();
      expect(user).toBeTruthy();
      expect(user?.emailVerified).toBe(0);
      const identity = await env.DB.prepare(
        'SELECT app_user_id, provider_subject FROM auth_identities WHERE provider = ? AND provider_subject = ?'
      )
        .bind('better-auth', user?.id)
        .first<{ app_user_id: string; provider_subject: string }>();
      expect(identity).toEqual({
        app_user_id: user?.id,
        provider_subject: user?.id,
      });

      const beforeVerification = await workerFetch(
        authRequest('/sign-in/email', {
          method: 'POST',
          body: { email, password: 'strong-password-123' },
        })
      );
      expect(beforeVerification.status).toBe(403);

      const verificationToken = await new SignJWT({ email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(env.BETTER_AUTH_SECRET));
      const verification = await workerFetch(
        authRequest(
          '/verify-email?token=' +
            encodeURIComponent(verificationToken) +
            '&callbackURL=' +
            encodeURIComponent('http://localhost:9002/'),
          { redirect: 'manual' }
        )
      );
      expect(verification.status).toBe(302);

      const verifiedUser = await env.DB.prepare(
        'SELECT id, emailVerified FROM user WHERE lower(email) = lower(?)'
      )
        .bind(email)
        .first<{ id: string; emailVerified: number }>();
      expect(verifiedUser?.id).toBe(user?.id);
      expect(verifiedUser?.emailVerified).toBe(1);

      const passwordSignin = await workerFetch(
        authRequest('/sign-in/email', {
          method: 'POST',
          body: { email, password: 'strong-password-123' },
        })
      );
      expect(passwordSignin.status).toBe(200);
      expect(passwordSignin.headers.get('Set-Cookie')).toContain(
        'better-auth.session_token'
      );

      const duplicateSignup = await workerFetch(
        authRequest('/sign-up/email', {
          method: 'POST',
          body: { name: 'New User', email, password: 'strong-password-123' },
        })
      );
      expect(duplicateSignup.status).toBe(200);
    } finally {
      env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED = previous;
    }
  });

  it('keeps Better Auth user creation atomic with its identity mapping and allows retry', async () => {
    const previousSignupFlag = env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED;
    const email = 'identity-retry-' + crypto.randomUUID() + '@example.test';
    const identityCountBefore = await env.DB.prepare(
      'SELECT count(*) AS count FROM auth_identities'
    ).first<{ count: number }>();
    const appUserCountBefore = await env.DB.prepare(
      'SELECT count(*) AS count FROM app_users'
    ).first<{ count: number }>();
    env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED = 'true';

    try {
      await env.DB.prepare(`
        CREATE TRIGGER simulate_better_auth_identity_failure
        BEFORE INSERT ON auth_identities
        WHEN NEW.provider = 'better-auth'
        BEGIN
          SELECT RAISE(ABORT, 'SIMULATED_IDENTITY_INSERT_FAILURE');
        END
      `).run();

      const failedSignup = await workerFetch(
        authRequest('/sign-up/email', {
          method: 'POST',
          body: { name: 'Retry User', email, password: 'strong-password-123' },
        })
      );
      expect(failedSignup.status).toBeGreaterThanOrEqual(400);

      const failedUser = await env.DB.prepare(
        'SELECT id FROM user WHERE email = ?'
      )
        .bind(email)
        .first<{ id: string }>();
      const identityCountAfterFailure = await env.DB.prepare(
        'SELECT count(*) AS count FROM auth_identities'
      ).first<{ count: number }>();
      const appUserCountAfterFailure = await env.DB.prepare(
        'SELECT count(*) AS count FROM app_users'
      ).first<{ count: number }>();
      expect(failedUser).toBeNull();
      expect(identityCountAfterFailure?.count).toBe(identityCountBefore?.count);
      expect(appUserCountAfterFailure?.count).toBe(appUserCountBefore?.count);

      await env.DB.prepare(
        'DROP TRIGGER simulate_better_auth_identity_failure'
      ).run();
      const retriedSignup = await workerFetch(
        authRequest('/sign-up/email', {
          method: 'POST',
          body: { name: 'Retry User', email, password: 'strong-password-123' },
        })
      );
      expect(retriedSignup.status).toBe(200);

      const user = await env.DB.prepare(
        'SELECT id FROM user WHERE email = ?'
      )
        .bind(email)
        .first<{ id: string }>();
      expect(user).toBeTruthy();
      const identity = await env.DB.prepare(
        'SELECT app_user_id, provider_subject FROM auth_identities WHERE provider = ? AND provider_subject = ?'
      )
        .bind('better-auth', user?.id)
        .first<{ app_user_id: string; provider_subject: string }>();
      expect(identity).toEqual({
        app_user_id: user?.id,
        provider_subject: user?.id,
      });
    } finally {
      await env.DB.prepare(
        'DROP TRIGGER IF EXISTS simulate_better_auth_identity_failure'
      ).run();
      env.MATMETRICS_EMAIL_PASSWORD_SIGNUP_ENABLED = previousSignupFlag;
    }
  });

  it('rejects a Better Auth user ID already linked to another MatMetrics account', async () => {
    const conflictingUserId = 'conflicting-subject-' + crypto.randomUUID();
    const ownerId = 'conflicting-owner-' + crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO app_users (id, created_at, updated_at) VALUES (?, ?, ?)'
    )
      .bind(ownerId, now, now)
      .run();
    await env.DB.prepare(
      'INSERT INTO auth_identities (id, app_user_id, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(
        'conflicting-identity-' + crypto.randomUUID(),
        ownerId,
        'better-auth',
        conflictingUserId,
        now
      )
      .run();

    try {
      let insertError: unknown;
      try {
        await env.DB.prepare(
          'INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, 0, NULL, ?, ?)'
        )
          .bind(
            conflictingUserId,
            'Conflicting User',
            conflictingUserId + '@example.test',
            now,
            now
          )
          .run();
      } catch (error) {
        insertError = error;
      }

      expect(String(insertError)).toContain('BETTER_AUTH_IDENTITY_CONFLICT');
      const user = await env.DB.prepare('SELECT id FROM user WHERE id = ?')
        .bind(conflictingUserId)
        .first<{ id: string }>();
      expect(user).toBeNull();
    } finally {
      await env.DB.prepare('DELETE FROM app_users WHERE id = ?')
        .bind(ownerId)
        .run();
    }
  });

  it('uses password reset to set the first credential without changing an existing passkey account', async () => {
    const userId = 'legacy-account-' + crypto.randomUUID();
    const email = userId + '@example.test';
    await createUser(userId);
    await createPasskey(userId, userId + '-passkey');
    await createSession(userId);
    const knownRequest = await workerFetch(
      authRequest('/request-password-reset', {
        method: 'POST',
        body: { email, redirectTo: 'http://localhost:9002/reset-password' },
      })
    );
    const unknownRequest = await workerFetch(
      authRequest('/request-password-reset', {
        method: 'POST',
        body: {
          email: 'unknown-' + crypto.randomUUID() + '@example.test',
          redirectTo: 'http://localhost:9002/reset-password',
        },
      })
    );
    expect(knownRequest.status).toBe(200);
    expect(await knownRequest.json()).toEqual(await unknownRequest.json());

    const resetRecord = await env.DB.prepare(
      "SELECT identifier FROM verification WHERE value = ? AND identifier LIKE 'reset-password:%' ORDER BY createdAt DESC LIMIT 1"
    )
      .bind(userId)
      .first<{ identifier: string }>();
    expect(resetRecord).toBeTruthy();
    const token = resetRecord!.identifier.slice('reset-password:'.length);

    const reset = await workerFetch(
      authRequest('/reset-password', {
        method: 'POST',
        body: { token, newPassword: 'first-password-123' },
      })
    );
    expect(reset.status).toBe(200);

    const account = await env.DB.prepare(
      "SELECT userId, providerId, password FROM account WHERE userId = ? AND providerId = 'credential'"
    )
      .bind(userId)
      .first<{ userId: string; providerId: string; password: string }>();
    expect(account?.userId).toBe(userId);
    expect(account?.password).toBeTruthy();
    expect(await passkeyCount(userId)).toBe(1);
    const identity = await env.DB.prepare(
      'SELECT app_user_id, provider, provider_subject FROM auth_identities WHERE app_user_id = ?'
    )
      .bind(userId)
      .first<{
        app_user_id: string;
        provider: string;
        provider_subject: string;
      }>();
    expect(identity).toEqual({
      app_user_id: userId,
      provider: 'better-auth',
      provider_subject: userId,
    });

    const sessions = await env.DB.prepare(
      'SELECT count(*) AS count FROM session WHERE userId = ?'
    )
      .bind(userId)
      .first<{ count: number }>();
    expect(sessions?.count).toBe(0);

    const replay = await workerFetch(
      authRequest('/reset-password', {
        method: 'POST',
        body: { token, newPassword: 'another-password-456' },
      })
    );
    expect(replay.status).toBeGreaterThanOrEqual(400);

    const passwordSignin = await workerFetch(
      authRequest('/sign-in/email', {
        method: 'POST',
        body: { email, password: 'first-password-123' },
      })
    );
    expect(passwordSignin.status).toBe(200);
    expect(await passkeyCount(userId)).toBe(1);
  });

  it('rejects an expired password-reset link', async () => {
    const userId = 'expired-reset-' + crypto.randomUUID();
    const email = userId + '@example.test';
    await createUser(userId);

    const request = await workerFetch(
      authRequest('/request-password-reset', {
        method: 'POST',
        body: { email, redirectTo: 'http://localhost:9002/reset-password' },
      })
    );
    expect(request.status).toBe(200);
    const resetRecord = await env.DB.prepare(
      "SELECT identifier FROM verification WHERE value = ? AND identifier LIKE 'reset-password:%' ORDER BY createdAt DESC LIMIT 1"
    )
      .bind(userId)
      .first<{ identifier: string }>();
    expect(resetRecord).toBeTruthy();
    const token = resetRecord!.identifier.slice('reset-password:'.length);
    await env.DB.prepare('UPDATE verification SET expiresAt = ? WHERE identifier = ?')
      .bind(Date.now() - 1000, resetRecord!.identifier)
      .run();

    const reset = await workerFetch(
      authRequest('/reset-password', {
        method: 'POST',
        body: { token, newPassword: 'expired-password-123' },
      })
    );
    expect(reset.status).toBeGreaterThanOrEqual(400);
    const account = await env.DB.prepare(
      "SELECT count(*) AS count FROM account WHERE userId = ? AND providerId = 'credential'"
    )
      .bind(userId)
      .first<{ count: number }>();
    expect(account?.count).toBe(0);
  });

  it('requires an authenticated account before registering a passkey', async () => {
    const response = await workerFetch(
      authRequest('/passkey/generate-register-options')
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
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
