import {
  assertIdentityLinkAllowed,
  betterAuthIdentityForUser,
  firebaseIdentityForUid,
  IdentityLinkConflictError,
  type AuthIdentity,
} from '../../../src/lib/auth-identity';
import type { PasskeyRegistrationClaims } from '../../../src/lib/passkey-registration-context';

export {
  betterAuthIdentityForUser,
  firebaseIdentityForUid,
} from '../../../src/lib/auth-identity';

type StoredIdentity = {
  app_user_id: string;
  provider_subject: string;
};

async function getStoredIdentities(
  db: D1Database,
  identity: AuthIdentity
): Promise<{
  providerSubjectIdentity: StoredIdentity | null;
  userProviderIdentity: StoredIdentity | null;
}> {
  const [providerSubjectIdentity, userProviderIdentity] = await Promise.all([
    db
      .prepare(
        'SELECT app_user_id, provider_subject FROM auth_identities WHERE provider = ? AND provider_subject = ?'
      )
      .bind(identity.provider, identity.providerSubject)
      .first<StoredIdentity>(),
    db
      .prepare(
        'SELECT app_user_id, provider_subject FROM auth_identities WHERE app_user_id = ? AND provider = ?'
      )
      .bind(identity.appUserId, identity.provider)
      .first<StoredIdentity>(),
  ]);

  return { providerSubjectIdentity, userProviderIdentity };
}

function assertStoredIdentitiesAllowed(
  identity: AuthIdentity,
  stored: Awaited<ReturnType<typeof getStoredIdentities>>
): void {
  assertIdentityLinkAllowed(
    identity,
    stored.providerSubjectIdentity?.app_user_id ?? null
  );
  if (
    stored.userProviderIdentity &&
    stored.userProviderIdentity.provider_subject !== identity.providerSubject
  ) {
    throw new IdentityLinkConflictError();
  }
}

export async function ensureAuthIdentity(
  db: D1Database,
  identity: AuthIdentity,
  now = Date.now()
): Promise<void> {
  const existing = await getStoredIdentities(db, identity);
  assertStoredIdentitiesAllowed(identity, existing);
  if (existing.providerSubjectIdentity) {
    return;
  }

  try {
    // D1 executes a batch as a transaction. A concurrent conflicting insert now
    // fails a UNIQUE constraint and rolls back the whole batch instead of being
    // silently committed by INSERT OR IGNORE.
    await db.batch([
      db
        .prepare(
          'INSERT OR IGNORE INTO app_users (id, created_at, updated_at) VALUES (?, ?, ?)'
        )
        .bind(identity.appUserId, now, now),
      db
        .prepare(
          'INSERT INTO auth_identities (id, app_user_id, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(
          crypto.randomUUID(),
          identity.appUserId,
          identity.provider,
          identity.providerSubject,
          now
        ),
    ]);
  } catch (error) {
    const winner = await getStoredIdentities(db, identity);
    assertStoredIdentitiesAllowed(identity, winner);

    // An identical concurrent request won the race, so the desired mapping is
    // established. Do not hide unrelated database failures.
    if (winner.providerSubjectIdentity) {
      return;
    }
    throw error;
  }
}

export async function completePasskeyRegistration(
  db: D1Database,
  claims: PasskeyRegistrationClaims,
  expiresAt: number,
  now = Date.now()
): Promise<void> {
  const identities: AuthIdentity[] = [
    betterAuthIdentityForUser(claims.appUserId, claims.appUserId),
    ...(claims.provider === 'firebase'
      ? [firebaseIdentityForUid(claims.providerSubject)]
      : []),
  ];
  const current = await Promise.all(
    identities.map((identity) => getStoredIdentities(db, identity))
  );
  identities.forEach((identity, index) => {
    assertStoredIdentitiesAllowed(identity, current[index]);
  });

  const missingIdentities = identities.filter(
    (identity, index) => !current[index]?.providerSubjectIdentity
  );
  const completion = db
    .prepare(
      'INSERT INTO auth_registration_context_completions (nonce, app_user_id, completed_at) VALUES (?, ?, ?)'
    )
    .bind(claims.nonce, claims.appUserId, now);
  const markCompleted = db
    .prepare(
      'UPDATE auth_registration_context_claims SET completed_at = ? WHERE nonce = ? AND app_user_id = ? AND completed_at IS NULL AND expires_at = ?'
    )
    .bind(now, claims.nonce, claims.appUserId, expiresAt);
  const insertUser = db
    .prepare(
      'INSERT OR IGNORE INTO app_users (id, created_at, updated_at) VALUES (?, ?, ?)'
    )
    .bind(claims.appUserId, now, now);
  const insertIdentities = missingIdentities.map((identity) =>
    db
      .prepare(
        'INSERT INTO auth_identities (id, app_user_id, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(
        crypto.randomUUID(),
        identity.appUserId,
        identity.provider,
        identity.providerSubject,
        now
      )
  );

  try {
    const result = await db.batch([
      completion,
      markCompleted,
      insertUser,
      ...insertIdentities,
    ]);
    if (result[0]?.meta.changes !== 1 || result[1]?.meta.changes !== 1) {
      throw new Error(
        'Passkey registration context is expired or already used'
      );
    }
  } catch (error) {
    // Another valid ceremony may have inserted the exact same provider links
    // between the read and batch. Retry only the context claim after verifying
    // that every winning mapping is identical; conflicting links still fail.
    const winners = await Promise.all(
      identities.map((identity) => getStoredIdentities(db, identity))
    );
    identities.forEach((identity, index) => {
      assertStoredIdentitiesAllowed(identity, winners[index]);
    });
    if (
      winners.some((stored) => !stored.providerSubjectIdentity) ||
      missingIdentities.length === 0
    ) {
      throw error;
    }

    const result = await db.batch([completion, markCompleted]);
    if (result[0]?.meta.changes !== 1 || result[1]?.meta.changes !== 1) {
      throw new Error(
        'Passkey registration context is expired or already used'
      );
    }
  }

  const verified = await Promise.all(
    identities.map((identity) => getStoredIdentities(db, identity))
  );
  identities.forEach((identity, index) => {
    assertStoredIdentitiesAllowed(identity, verified[index]);
  });
}
