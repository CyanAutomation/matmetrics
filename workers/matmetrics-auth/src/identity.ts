import {
  assertIdentityLinkAllowed,
  IdentityLinkConflictError,
  type AuthIdentity,
} from '../../../src/lib/auth-identity';

export { betterAuthIdentityForUser, firebaseIdentityForUid } from '../../../src/lib/auth-identity';

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
